"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  adminCheckProposalConflictsAction,
  adminForceResolveProposalAction,
  type ProposalConflictWarning,
} from "@/actions/proposals";
import { logUserActivity } from "@/lib/audit";
import { requireAdminAccess, withDb } from "@/lib/actions/context";
import {
  buildBatchEntriesFromAdminRows,
  adminFastSleepingPlanSchema,
  type AdminFastSleepingPlanInput,
} from "@/lib/admin/fast-sleeping-plan";
import {
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  sleepingPartnerships,
  users,
  locations,
  type InviteeRole,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import {
  encodeBatchSlotMeta,
  unionBatchInvitees,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import { sleepingDateToStartIso } from "@/lib/proposals/sleeping-schedule";
import type { PersonSummary } from "@/actions/users";

export interface AdminFastSleepingPlanResult {
  ok: boolean;
  message: string;
  warnings?: ProposalConflictWarning[];
  proposalId?: string;
}

async function getAcceptedSleepingPartnerIds(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<Set<string>> {
  const partnershipRows = await db
    .select({
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
    })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.status, "accepted"),
        or(
          eq(sleepingPartnerships.userLowId, userId),
          eq(sleepingPartnerships.userHighId, userId),
        ),
      ),
    );

  return new Set(
    partnershipRows.map((row) => (row.userLowId === userId ? row.userHighId : row.userLowId)),
  );
}

async function assertSleepingInviteesForTarget(
  db: ReturnType<typeof getDb>,
  targetUserId: string,
  intentionalSolo: boolean,
  invitees: { userId: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (intentionalSolo || invitees.length === 0) return { ok: true };

  const partners = await getAcceptedSleepingPartnerIds(db, targetUserId);
  for (const invitee of invitees) {
    if (!partners.has(invitee.userId)) {
      return {
        ok: false,
        error:
          "Sleeping arrangements can only include accepted sleeping partners of the target user, or be solo.",
      };
    }
  }
  return { ok: true };
}

async function assertLocationAllowedForAdmin(
  db: ReturnType<typeof getDb>,
  locationId: string | undefined,
  locationText?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (locationId && locationText?.trim()) {
    return { ok: false, error: "Choose either a registered place or custom location text, not both." };
  }
  if (!locationId) return { ok: true };

  const [place] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!place) {
    return { ok: false, error: "Selected place was not found." };
  }
  return { ok: true };
}

async function replaceInvitees(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  proposerId: string,
  invitees: { userId: string; role: InviteeRole }[],
): Promise<void> {
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));

  const now = new Date().toISOString();
  const uniqueInvitees = invitees.filter(
    (invitee, index, list) =>
      invitee.userId !== proposerId &&
      list.findIndex((row) => row.userId === invitee.userId) === index,
  );

  for (const invitee of uniqueInvitees) {
    await db.insert(proposalInvitees).values({
      id: `pi-${randomUUID()}`,
      proposalId,
      userId: invitee.userId,
      role: invitee.role,
      voteStatus: "not_seen",
      createdAt: now,
    });
  }
}

async function persistBatchSleepingDraft(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  entries: BatchSleepingEntry[],
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));

  const now = new Date().toISOString();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const startIso = sleepingDateToStartIso(entry.nightDate.slice(0, 10));
    if (!startIso) {
      throw new Error("Invalid batch night date.");
    }
    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId,
      startAt: startIso,
      endAt: null,
      label: encodeBatchSlotMeta({
        batchEntryId: entry.id,
        locationId: entry.locationId,
        locationText: entry.locationText,
        bedroomIndex: entry.bedroomIndex,
        intentionalSolo: entry.intentionalSolo,
        inviteeUserIds: entry.intentionalSolo
          ? []
          : entry.invitees.map((invitee) => invitee.userId),
      }),
      sortOrder: index,
      isAllDay: false,
      createdAt: now,
    });
  }
}

async function deleteDraftProposal(
  db: ReturnType<typeof getDb>,
  proposalId: string,
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));
  await db.delete(proposalComments).where(eq(proposalComments.proposalId, proposalId));
  await db.delete(proposalStateLog).where(eq(proposalStateLog.proposalId, proposalId));
  await db.delete(proposals).where(eq(proposals.id, proposalId));
}

async function buildSleepingProposalTitle(
  db: ReturnType<typeof getDb>,
  input: {
    proposerName: string;
    intentionalSolo: boolean;
    batchEntries: BatchSleepingEntry[];
    inviteeUserIds: string[];
  },
): Promise<string> {
  let inviteeNames: string[] = [];
  if (!input.intentionalSolo && input.inviteeUserIds.length > 0) {
    const rows = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, input.inviteeUserIds));
    inviteeNames = rows.map((row) => row.displayName);
  }

  let locationName: string | null = null;
  const firstLocated = input.batchEntries.find(
    (entry) => entry.locationId || entry.locationText?.trim(),
  );
  if (firstLocated?.locationText?.trim()) {
    locationName = firstLocated.locationText.trim();
  } else if (firstLocated?.locationId) {
    const [place] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, firstLocated.locationId))
      .limit(1);
    locationName = place?.name ?? null;
  }

  return formatSleepingDisplayTitle({
    proposerName: input.proposerName,
    inviteeNames,
    intentionalSolo: input.intentionalSolo,
    locationName,
    state: "resolved",
    atRisk: false,
  });
}

/**
 * Lists accepted sleeping partners for a target user (admin-only, PC-119).
 */
export async function listSleepingPartnersForUserAction(
  targetUserId: string,
): Promise<PersonSummary[]> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) return [];

  return withDb(async (db) => {
    const partnerIds = [...(await getAcceptedSleepingPartnerIds(db, targetUserId))];
    if (partnerIds.length === 0) return [];

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
        avatarKey: users.avatarKey,
        profileBio: users.profileBio,
      })
      .from(users)
      .where(inArray(users.id, partnerIds))
      .orderBy(asc(users.displayName));

    return rows.map((row) => ({
      ...row,
      avatarKey: row.avatarKey ?? null,
      profileBio: row.profileBio ?? null,
    }));
  });
}

/**
 * Admin fast-add: creates one resolved batch sleeping proposal for a target user (PC-118).
 * Conflict overlaps warn + confirm before finalizing.
 */
export async function adminFastAddSleepingPlanAction(
  input: AdminFastSleepingPlanInput,
): Promise<AdminFastSleepingPlanResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  const parsed = adminFastSleepingPlanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { targetUserId, rows, confirm } = parsed.data;
  const batchEntries = buildBatchEntriesFromAdminRows(rows);

  if (batchEntries.length === 0) {
    return { ok: false, message: "Configure at least one night before submitting." };
  }

  return withDb(async (db) => {
    const [targetUser] = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser || targetUser.status === "deleted") {
      return { ok: false, message: "Target user not found." };
    }
    if (targetUser.role === "passive") {
      return { ok: false, message: "Cannot fast-add sleeping plans for passive users." };
    }

    for (const entry of batchEntries) {
      const inviteeCheck = await assertSleepingInviteesForTarget(
        db,
        targetUserId,
        Boolean(entry.intentionalSolo),
        entry.invitees,
      );
      if (!inviteeCheck.ok) {
        return { ok: false, message: inviteeCheck.error };
      }

      if (!entry.intentionalSolo && entry.invitees.length === 0) {
        return {
          ok: false,
          message: "Each configured night needs partners or intentional solo.",
        };
      }

      if (entry.locationId || entry.locationText) {
        const locationCheck = await assertLocationAllowedForAdmin(
          db,
          entry.locationId,
          entry.locationText,
        );
        if (!locationCheck.ok) {
          return { ok: false, message: locationCheck.error };
        }
      }
    }

    const intentionalSolo = batchEntries.every((entry) => entry.intentionalSolo);
    const batchInvitees = unionBatchInvitees(batchEntries);
    const proposalId = `prop-${randomUUID()}`;
    const now = new Date().toISOString();

    const proposalTitle = await buildSleepingProposalTitle(db, {
      proposerName: targetUser.displayName,
      intentionalSolo,
      batchEntries,
      inviteeUserIds: batchInvitees.map((row) => row.userId),
    });

    await db.insert(proposals).values({
      id: proposalId,
      title: proposalTitle,
      description: null,
      proposalType: "sleeping",
      state: "draft",
      proposerId: targetUserId,
      locationId: null,
      locationText: null,
      notes: null,
      intentionalSolo,
      isPoll: false,
      isAllDay: false,
      eventPrivacy: "open",
      isRecurrenceParent: false,
      recurrenceRule: null,
      occurrenceIndex: null,
      bedroomIndex: null,
      isBatchSleeping: true,
      batchEntriesJson: JSON.stringify(batchEntries),
      reminderOffsetMinutes: null,
      reminderSentAt: null,
      eventIconKey: null,
      createdAt: now,
      updatedAt: now,
    });

    await replaceInvitees(db, proposalId, targetUserId, batchInvitees);
    await persistBatchSleepingDraft(db, proposalId, batchEntries);
    await logProposalTransition(db, proposalId, adminResult.user.id, "draft.created");

    if (!confirm) {
      const conflictCheck = await adminCheckProposalConflictsAction(proposalId);
      if (!conflictCheck.ok) {
        await deleteDraftProposal(db, proposalId);
        return { ok: false, message: conflictCheck.message };
      }
      if (conflictCheck.warnings.length > 0) {
        await deleteDraftProposal(db, proposalId);
        return {
          ok: false,
          message: "Schedule conflicts detected. Review warnings and confirm to submit.",
          warnings: conflictCheck.warnings,
        };
      }
    }

    const activityDetails = JSON.stringify({
      targetUserId,
      targetDisplayName: targetUser.displayName,
      nightCount: batchEntries.length,
      proposalId,
    });

    await logProposalTransition(
      db,
      proposalId,
      adminResult.user.id,
      "proposal.admin_fast_add",
      activityDetails,
    );

    const resolveResult = await adminForceResolveProposalAction(proposalId, adminResult.user.id);
    if (!resolveResult.ok) {
      await deleteDraftProposal(db, proposalId);
      return { ok: false, message: resolveResult.message };
    }

    await logUserActivity(adminResult.user.id, "admin.fast_sleeping_plan_add", activityDetails);

    revalidatePath("/admin");
    revalidatePath("/proposals");
    revalidatePath("/schedule");
    revalidatePath("/people-places");

    return {
      ok: true,
      message: `Sleeping plan added for ${targetUser.displayName} (${batchEntries.length} night${batchEntries.length === 1 ? "" : "s"}).`,
      proposalId,
    };
  });
}
