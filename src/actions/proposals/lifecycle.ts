"use server";

/**
 * Resolved-proposal lifecycle server actions (PC-329 core carve): attendee
 * management, reschedule, cancel/archive, redraft, and pending-voter nudges.
 *
 * Moved verbatim out of `_core.ts` (Epic 4) with no behavior, copy, or guard
 * changes. Depends only on shared service/leaf modules — never on `_core` — so
 * the module graph stays acyclic while `@/actions/proposals` re-exports these.
 */
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { adminAccessFromSessionUser, userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  proposalInvitees,
  proposalSlotVotes,
  proposalTimeSlots,
  proposals,
  users,
  type InviteeRole,
  type InviteeVoteStatus,
} from "@/lib/db/schema";
import { actorNotifyFields, notifyUser } from "@/lib/notifications";
import { dismissNotificationsForProposal } from "@/actions/notifications";
import {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";
import {
  computeAtRiskExpiresAt,
  loadEnforcementSettings,
  runProposalEnforcement,
} from "@/lib/proposals/enforcement";
import { enterAtRiskProposedState } from "@/lib/proposals/services/at-risk";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { resetInviteeVotes } from "@/lib/proposals/services/votes";
import { notifyProposalParticipants } from "@/lib/proposals/services/notify-participants";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { canManageSleepingAttendees } from "@/lib/proposals/passive-auto-accept";
import {
  sleepingDateToStartIso,
  isoToSleepingDateInput,
  sleepingScheduleFromSlotRows,
} from "@/lib/proposals/sleeping-schedule";
import { APPROVING_VOTES } from "@/lib/proposals/constants";

import {
  attendeeUpdateResponseSchema,
  attendeeUpdateSchema,
  rescheduleProposalSchema,
} from "./schemas";

/**
 * Notifies proposer and all invitees on a proposal (PC-40).
 *
 * Thin wrapper over the shared {@link notifyProposalParticipants} fan-out that
 * layers on the standard proposal context (title/type/when/where) so the copy
 * and metadata are identical to the historical hand-rolled loop (PC-322).
 */
async function notifyProposalStakeholders(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  notificationType: string,
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  await notifyProposalParticipants(db, {
    proposalId: proposal.id,
    proposerId: proposal.proposerId,
    notificationType,
    message,
    metadata: {
      proposalTitle: proposal.title,
      proposalType: proposal.proposalType,
      // Extra proposal context so notification surfaces can render when/where.
      scheduledStartAt: proposal.scheduledStartAt ?? undefined,
      scheduledEndAt: proposal.scheduledEndAt ?? undefined,
      locationText: proposal.locationText ?? undefined,
      isAllDay: proposal.isAllDay ?? undefined,
      ...extra,
    },
  });
}

/**
 * Adds or removes attendees on a resolved proposal (PC-40, PC-45).
 */
export async function updateResolvedAttendeesAction(
  input: z.infer<typeof attendeeUpdateSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }
  const actorUserId = session.user.id;

  const parsed = attendeeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || proposal.state !== "resolved") {
    return { ok: false, message: "Proposal is not resolved." };
  }

  const [viewerInvitee] = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, proposal.id),
        eq(proposalInvitees.userId, session.user.id),
      ),
    )
    .limit(1);

  const isInvitee = Boolean(viewerInvitee);
  const isProposer = proposal.proposerId === session.user.id;
  if (proposal.proposalType === "sleeping") {
    if (!canManageSleepingAttendees(isProposer, isAdmin)) {
      return {
        ok: false,
        message: "Only the proposer or an admin can manage sleeping attendees.",
      };
    }
  } else if (!isProposer && !isAdmin && !isInvitee) {
    return { ok: false, message: "Only the proposer, an invitee, or an admin can update attendees." };
  }

  const now = new Date().toISOString();
  const actor = actorNotifyFields(session.user);
  let attendeesChanged = false;
  let removedRequiredAttendee = false;
  const addedRequiredNames: string[] = [];
  const addedOptionalNames: string[] = [];
  const addedBookedNames: string[] = [];
  const removedNames: string[] = [];

  if ((parsed.data.addBooked?.length ?? 0) > 0) {
    const settings = proposal.networkId
      ? await loadNetworkSettings(proposal.networkId, db)
      : null;
    if (settings?.schedulingPosting !== "proposals_and_bookings") {
      return {
        ok: false,
        message: "Booked attendees are only available when Proposals and Bookings is enabled.",
      };
    }
  }

  async function displayNameFor(userId: string): Promise<string> {
    const [user] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.displayName ?? userId;
  }

  for (const userId of parsed.data.removeUserIds ?? []) {
    const [row] = await db
      .select()
      .from(proposalInvitees)
      .where(
        and(eq(proposalInvitees.proposalId, proposal.id), eq(proposalInvitees.userId, userId)),
      )
      .limit(1);

    if (!row) continue;
    if (row.role === "required") removedRequiredAttendee = true;

    await db.delete(proposalSlotVotes).where(
      and(eq(proposalSlotVotes.proposalId, proposal.id), eq(proposalSlotVotes.userId, userId)),
    );
    await db.delete(proposalInvitees).where(eq(proposalInvitees.id, row.id));
    attendeesChanged = true;
    removedNames.push(await displayNameFor(userId));

    await notifyUser(userId, "proposal_attendee_removed", `${actor.actorDisplayName} removed you from "${proposal.title}".`, {
      proposalId: proposal.id,
      proposalType: proposal.proposalType,
      ...actor,
    });
  }

  async function addAttendee(userId: string, role: InviteeRole): Promise<void> {
    if (userId === proposal.proposerId) return;

    const [existing] = await db
      .select({ id: proposalInvitees.id, role: proposalInvitees.role })
      .from(proposalInvitees)
      .where(
        and(eq(proposalInvitees.proposalId, proposal.id), eq(proposalInvitees.userId, userId)),
      )
      .limit(1);

    if (existing) return;

    const isBooked = role === "booked";
    await db.insert(proposalInvitees).values({
      id: `pi-${randomUUID()}`,
      proposalId: proposal.id,
      userId,
      role,
      voteStatus: isBooked ? "accept" : "not_seen",
      respondedAt: isBooked ? now : null,
      addedByUserId: actorUserId,
      createdAt: now,
    });
    attendeesChanged = true;

    const name = await displayNameFor(userId);
    if (isBooked) addedBookedNames.push(name);
    else if (role === "required") addedRequiredNames.push(name);
    else addedOptionalNames.push(name);

    // Booked people are auto-accepted; notify them only — no vote / at-risk fan-out (PC-430).
    await notifyUser(
      userId,
      "proposal_attendee_added",
      isBooked
        ? `${actor.actorDisplayName} booked you for "${proposal.title}".`
        : `${actor.actorDisplayName} added you to "${proposal.title}".`,
      {
        proposalId: proposal.id,
        proposalType: proposal.proposalType,
        role,
        ...actor,
      },
    );
  }

  for (const userId of parsed.data.addRequired ?? []) {
    await addAttendee(userId, "required");
  }

  for (const userId of parsed.data.addOptional ?? []) {
    await addAttendee(userId, "optional");
  }

  for (const userId of parsed.data.addBooked ?? []) {
    await addAttendee(userId, "booked");
  }

  if (attendeesChanged) {
    if (removedRequiredAttendee) {
      const remainingRequired = await db
        .select({ userId: proposalInvitees.userId, voteStatus: proposalInvitees.voteStatus })
        .from(proposalInvitees)
        .where(
          and(eq(proposalInvitees.proposalId, proposal.id), eq(proposalInvitees.role, "required")),
        );

      for (const row of remainingRequired) {
        if (row.userId === session.user.id) continue;
        if (!APPROVING_VOTES.includes(row.voteStatus as InviteeVoteStatus)) continue;
        await notifyUser(
          row.userId,
          "proposal_attendee_update",
          `${actor.actorDisplayName} changed attendees on "${proposal.title}" — maintain your acceptance or decline.`,
          {
            proposalId: proposal.id,
            action: "attendee_update",
            proposalType: proposal.proposalType,
            ...actor,
          },
        );
      }
    }

    await logProposalTransition(
      db,
      proposal.id,
      session.user.id,
      "proposal.attendees_updated",
      JSON.stringify({
        addedRequired: addedRequiredNames,
        addedOptional: addedOptionalNames,
        addedBooked: addedBookedNames,
        removedUserIds: removedNames,
      }),
    );
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Attendees updated." };
}

/**
 * One-click response for remaining required invitees after proposer removes an attendee (PC-48).
 */
export async function respondAttendeeUpdateAction(
  input: z.infer<typeof attendeeUpdateResponseSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = attendeeUpdateResponseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid response." };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || proposal.state !== "resolved") {
    return { ok: false, message: "Proposal is not resolved." };
  }

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, proposal.id),
        eq(proposalInvitees.userId, session.user.id),
        eq(proposalInvitees.role, "required"),
      ),
    )
    .limit(1);

  if (!invitee) {
    return { ok: false, message: "You are not a required invitee on this proposal." };
  }

  if (parsed.data.response === "maintain") {
    await logProposalTransition(
      db,
      proposal.id,
      session.user.id,
      "proposal.attendee_update_maintained",
      "Required invitee maintained acceptance after attendee change.",
    );
    await dismissNotificationsForProposal(session.user.id, proposal.id);
    revalidatePath("/proposals");
    return { ok: true, message: "Your acceptance is unchanged." };
  }

  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ voteStatus: "decline", respondedAt: now })
    .where(eq(proposalInvitees.id, invitee.id));

  await enterAtRiskProposedState(
    db,
    proposal,
    session.user.id,
    "Required invitee revoked acceptance after attendee change.",
  );

  await dismissNotificationsForProposal(session.user.id, proposal.id);

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Your decline was recorded. The event is now at risk." };
}

/**
 * Revokes a required invitee's post-resolution acceptance, flagging the event at-risk (PC-48).
 */
export async function revokeResolvedAcceptanceAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal || proposal.state !== "resolved" || proposal.atRisk) {
    return { ok: false, message: "Proposal cannot be declined." };
  }

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, proposalId),
        eq(proposalInvitees.userId, session.user.id),
        eq(proposalInvitees.role, "required"),
      ),
    )
    .limit(1);

  if (!invitee || !APPROVING_VOTES.includes(invitee.voteStatus as InviteeVoteStatus)) {
    return { ok: false, message: "You have not accepted this event." };
  }

  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ voteStatus: "decline", respondedAt: now })
    .where(eq(proposalInvitees.id, invitee.id));

  await enterAtRiskProposedState(
    db,
    proposal,
    session.user.id,
    "Required invitee revoked acceptance post-resolution.",
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Event flagged at risk and returned to proposed." };
}

/**
 * Admin-only reschedule of a proposed calendar event (PC-48 / PC-430).
 * Resolved events are moved with Re-draft instead of Reschedule.
 */
export async function rescheduleProposalAction(
  input: z.infer<typeof rescheduleProposalSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  if (!isAdmin) {
    return { ok: false, message: "Admin access required." };
  }

  const parsed = rescheduleProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid schedule times." };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || proposal.state !== "proposed") {
    return { ok: false, message: "Only proposed events can be rescheduled." };
  }

  const now = new Date().toISOString();

  if (proposal.proposalType === "sleeping") {
    const startIso = sleepingDateToStartIso(
      isoToSleepingDateInput(parsed.data.scheduledStartAt),
    );
    if (!startIso) {
      return { ok: false, message: "Invalid sleeping date." };
    }

    const endIso = parsed.data.scheduledEndAt
      ? sleepingDateToStartIso(isoToSleepingDateInput(parsed.data.scheduledEndAt))
      : null;

    const slotRows = await db
      .select({
        id: proposalTimeSlots.id,
        startAt: proposalTimeSlots.startAt,
        sortOrder: proposalTimeSlots.sortOrder,
      })
      .from(proposalTimeSlots)
      .where(eq(proposalTimeSlots.proposalId, proposal.id))
      .orderBy(asc(proposalTimeSlots.sortOrder));

    if (proposal.isBatchSleeping && slotRows.length > 0) {
      const firstDate = isoToSleepingDateInput(slotRows[0]!.startAt);
      const newFirstDate = isoToSleepingDateInput(startIso);
      const firstMs = new Date(`${firstDate}T00:00:00`).getTime();
      const newFirstMs = new Date(`${newFirstDate}T00:00:00`).getTime();
      const dayDelta = Math.round((newFirstMs - firstMs) / 86_400_000);

      for (const slot of slotRows) {
        const oldDate = new Date(`${isoToSleepingDateInput(slot.startAt)}T00:00:00`);
        oldDate.setDate(oldDate.getDate() + dayDelta);
        const pad = (n: number) => String(n).padStart(2, "0");
        const shifted = `${oldDate.getFullYear()}-${pad(oldDate.getMonth() + 1)}-${pad(oldDate.getDate())}`;
        const shiftedIso = sleepingDateToStartIso(shifted);
        if (!shiftedIso) continue;
        await db
          .update(proposalTimeSlots)
          .set({ startAt: shiftedIso, endAt: null })
          .where(eq(proposalTimeSlots.id, slot.id));
      }

      const shiftedSlots = await db
        .select({ startAt: proposalTimeSlots.startAt, endAt: proposalTimeSlots.endAt })
        .from(proposalTimeSlots)
        .where(eq(proposalTimeSlots.proposalId, proposal.id))
        .orderBy(asc(proposalTimeSlots.sortOrder));
      const schedule = sleepingScheduleFromSlotRows(shiftedSlots);

      await db
        .update(proposals)
        .set({
          scheduledStartAt: schedule.start,
          scheduledEndAt: schedule.end,
          updatedAt: now,
        })
        .where(eq(proposals.id, proposal.id));
    } else {
      await db
        .update(proposals)
        .set({
          scheduledStartAt: startIso,
          scheduledEndAt: endIso,
          updatedAt: now,
        })
        .where(eq(proposals.id, proposal.id));

      if (slotRows.length > 0) {
        for (const slot of slotRows) {
          await db
            .update(proposalTimeSlots)
            .set({ startAt: startIso, endAt: endIso })
            .where(eq(proposalTimeSlots.id, slot.id));
        }
      }
    }
  } else {
    await db
      .update(proposals)
      .set({
        scheduledStartAt: parsed.data.scheduledStartAt,
        scheduledEndAt: parsed.data.scheduledEndAt ?? null,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));

    const [firstSlot] = await db
      .select({ id: proposalTimeSlots.id })
      .from(proposalTimeSlots)
      .where(eq(proposalTimeSlots.proposalId, proposal.id))
      .orderBy(asc(proposalTimeSlots.sortOrder))
      .limit(1);

    if (firstSlot) {
      await db
        .update(proposalTimeSlots)
        .set({
          startAt: parsed.data.scheduledStartAt,
          endAt: parsed.data.scheduledEndAt ?? null,
        })
        .where(eq(proposalTimeSlots.id, firstSlot.id));
    }
  }

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    "proposal.admin_rescheduled",
    JSON.stringify({
      scheduledStartAt: parsed.data.scheduledStartAt,
      scheduledEndAt: parsed.data.scheduledEndAt ?? null,
    }),
  );

  const actor = actorNotifyFields(session.user);
  await notifyProposalStakeholders(
    db,
    proposal,
    "proposal_rescheduled",
    `${actor.actorDisplayName} rescheduled "${proposal.title}".`,
    actor,
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  const { scheduleCalendarSync } = await import("@/lib/calendar/sync");
  await scheduleCalendarSync(proposal.id, "upsert");
  return { ok: true, message: "Event rescheduled." };
}

/**
 * Archives a proposed or resolved proposal (proposer or admin, PC-40).
 * Recurring items support occurrence-only or entire-series scope.
 */
export async function cancelProposalAction(
  proposalId: string,
  scope: "occurrence" | "series" = "occurrence",
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal || (proposal.state !== "proposed" && proposal.state !== "resolved")) {
    return { ok: false, message: "Proposal cannot be cancelled." };
  }

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  if (proposal.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Only the proposer or an admin can cancel." };
  }

  const now = new Date().toISOString();
  const actorId = session.user.id;
  const archivedIds: string[] = [];

  async function archiveOne(id: string): Promise<void> {
    await db
      .update(proposals)
      .set({
        state: "archived",
        archiveKind: "cancelled",
        scheduledStartAt: null,
        scheduledEndAt: null,
        // Drop batch night payload so cancelled batch cannot reappear via slots (PC-373).
        batchEntriesJson: null,
        atRisk: false,
        updatedAt: now,
      })
      .where(eq(proposals.id, id));
    // Detach leftover slots so any leftover schedule rebuild path ignores them.
    await db
      .update(proposalTimeSlots)
      .set({ isDetached: true })
      .where(eq(proposalTimeSlots.proposalId, id));
    await logProposalTransition(db, id, actorId, "proposal.cancelled");
    archivedIds.push(id);
  }

  if (scope === "series" && (proposal.isRecurrenceParent || proposal.parentProposalId)) {
    const rootId = proposal.isRecurrenceParent ? proposal.id : proposal.parentProposalId!;
    const toArchive = new Set<string>([rootId]);

    const childRows = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(
        and(
          eq(proposals.parentProposalId, rootId),
          inArray(proposals.state, ["proposed", "resolved", "draft"]),
        ),
      );

    for (const child of childRows) {
      toArchive.add(child.id);
    }
    if (!proposal.isRecurrenceParent) {
      toArchive.add(proposal.id);
    }

    for (const id of toArchive) {
      await archiveOne(id);
    }
  } else if (proposal.parentProposalId && scope === "occurrence") {
    const forkId = `prop-${randomUUID()}`;
    await db.insert(proposals).values({
      id: forkId,
      networkId: proposal.networkId,
      title: `${proposal.title} (forked)`,
      description: proposal.description,
      proposalType: proposal.proposalType,
      state: "archived",
      proposerId: proposal.proposerId,
      locationId: proposal.locationId,
      intentionalSolo: proposal.intentionalSolo,
      eventPrivacy: proposal.eventPrivacy,
      isPoll: proposal.isPoll,
      parentProposalId: null,
      occurrenceIndex: proposal.occurrenceIndex,
      bedroomIndex: proposal.bedroomIndex,
      notes: proposal.notes,
      createdAt: now,
      updatedAt: now,
    });
    await logProposalTransition(
      db,
      forkId,
      actorId,
      "proposal.occurrence_forked",
      JSON.stringify({ sourceId: proposal.id }),
    );
    await archiveOne(proposal.id);
  } else {
    await archiveOne(proposal.id);
  }

  await notifyProposalStakeholders(
    db,
    proposal,
    "proposal_cancelled",
    `Proposal "${proposal.title}" was cancelled.`,
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  const { scheduleCalendarSync } = await import("@/lib/calendar/sync");
  for (const id of archivedIds) {
    await scheduleCalendarSync(id, "delete");
  }

  return { ok: true, message: "Proposal cancelled and archived." };
}

/**
 * Moves a resolved proposal back to drafts with an at-risk calendar flag (PC-40).
 */
export async function redraftProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal || proposal.state !== "resolved" || proposal.proposerId !== session.user.id) {
    return { ok: false, message: "Proposal cannot be re-drafted." };
  }

  const now = new Date().toISOString();
  const enforcement = await loadEnforcementSettings(db);
  const expiresAt = computeAtRiskExpiresAt(enforcement, proposal.scheduledStartAt);
  await db
    .update(proposals)
    .set({
      state: "draft",
      atRisk: true,
      atRiskExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposalId));

  await resetInviteeVotes(db, proposalId);
  await logProposalTransition(db, proposalId, session.user.id, "proposal.redrafted");
  await dismissAllNotificationsForProposal(proposalId);
  await notifyProposalStakeholders(
    db,
    proposal,
    "proposal_redrafted",
    formatDraftReturnNotification(proposal.title, "Moved back for editing"),
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Proposal moved to drafts. Calendar entry flagged at-risk until resubmitted." };
}

const NUDGE_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Notifies invitees who have not voted yet (proposer or admin, PC-293).
 */
export async function nudgePendingVotersAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; nudgedCount?: number }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) {
    return { ok: false, message: "Proposal not found." };
  }

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  if (proposal.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Only the proposer or an admin can nudge voters." };
  }

  const invitees = await db
    .select({
      userId: proposalInvitees.userId,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const pending = invitees.filter((row) => row.voteStatus === "not_seen");
  const hasPendingOptional =
    proposal.state === "resolved" &&
    invitees.some((row) => row.role === "optional" && row.voteStatus === "not_seen");

  if (proposal.state !== "proposed" && !hasPendingOptional) {
    return { ok: false, message: "Only open proposals can be nudged." };
  }

  if (pending.length === 0) {
    return { ok: true, message: "Everyone has already responded.", nudgedCount: 0 };
  }

  if (proposal.lastNudgeAt) {
    const lastMs = Date.parse(proposal.lastNudgeAt);
    if (!Number.isNaN(lastMs) && Date.now() - lastMs < NUDGE_COOLDOWN_MS) {
      return { ok: false, message: "Wait at least an hour between nudges." };
    }
  }

  const now = new Date().toISOString();
  for (const invitee of pending) {
    await notifyUser(
      invitee.userId,
      "proposal_nudge",
      `Reminder: "${proposal.title}" still needs your response.`,
      {
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        proposalType: proposal.proposalType,
        action: "vote",
      },
    );
  }

  await db
    .update(proposals)
    .set({ lastNudgeAt: now, updatedAt: now })
    .where(eq(proposals.id, proposalId));

  await logProposalTransition(
    db,
    proposalId,
    session.user.id,
    "proposal.vote_nudge",
    JSON.stringify({ nudgedCount: pending.length }),
  );

  revalidatePath("/proposals");
  return {
    ok: true,
    message: `Nudged ${pending.length} pending voter${pending.length === 1 ? "" : "s"}.`,
    nudgedCount: pending.length,
  };
}

/**
 * Posts a resolved event to the Feed by flipping post_to_feed and logging
 * a resolved milestone (PC-430). Existing feed prefs and sleeping gates apply.
 */
export async function postProposalToFeedAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const trimmedId = proposalId.trim();
  if (!trimmedId) {
    return { ok: false, message: "Proposal is required." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, trimmedId))
    .limit(1);

  if (!proposal || proposal.state !== "resolved") {
    return { ok: false, message: "Only resolved events can be posted to Feed." };
  }

  const isProposer = proposal.proposerId === session.user.id;
  if (!isProposer && !isAdmin) {
    return { ok: false, message: "Only the proposer or an admin can post this event to Feed." };
  }

  const settings = proposal.networkId
    ? await loadNetworkSettings(proposal.networkId, db)
    : null;
  if (settings?.feedEnabled === false) {
    return { ok: false, message: "Feed is disabled for this network." };
  }

  if (proposal.postToFeed) {
    return { ok: false, message: "This event is already posted to Feed." };
  }

  const now = new Date().toISOString();
  await db
    .update(proposals)
    .set({ postToFeed: true, updatedAt: now })
    .where(eq(proposals.id, proposal.id));

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    "proposal.posted_to_feed",
    "Posted resolved event to Feed.",
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  revalidatePath("/feed");
  return { ok: true, message: "Posted to Feed." };
}
