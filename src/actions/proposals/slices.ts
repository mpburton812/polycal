"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locations,
  polyGroup,
  proposalComments,
  proposalInvitees,
  proposalTimeSlots,
  proposals,
  users,
} from "@/lib/db/schema";
import { actorNotifyFields } from "@/lib/notifications";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { notifyProposalParticipants } from "@/lib/proposals/services/notify-participants";
import { logUserActivity } from "@/lib/audit";
import {
  parseBatchEntriesJson,
  parseBatchSlotMeta,
} from "@/lib/proposals/batch-sleeping";
import {
  applyProposalMask,
  canViewProposalContent,
  getAdminCanSeeUninvolved,
} from "@/lib/proposals/access";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import { proposalDescriptionForDisplay } from "@/lib/proposals/special-proposals";
import { getAcceptedSleepingPartnerIds } from "@/lib/proposals/partners";
import {
  allDayBoundsForDateKey,
  expandAllDayDateKeys,
  proposalHasSchedulableWindows,
} from "@/lib/schedule/schedule-slices";
import { formatSliceTag } from "@/lib/schedule/slice-types";
import { canCommentOnProposal, validateSliceMembership } from "@/lib/schedule/slice-auth";
import { localDateKey } from "@/lib/schedule/dates";
import { resolveTimezone } from "@/lib/schedule/timezone";
import type { ProposalSliceDetail } from "./slice-types";

type DbExecutor = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const sliceDetailSchema = z.object({
  rootProposalId: z.string().min(1),
  sliceKind: z.enum(["batch_night", "virtual_span_day"]),
  sliceKey: z
    .string()
    .min(1)
    .max(80)
    .refine(
      (value) => value.length > 0,
      "Slice key is required.",
    ),
});

const detachSliceSchema = sliceDetailSchema;

async function getSlicePrivacyFlags(db: ReturnType<typeof getDb>) {
  const [group] = await db
    .select({ hideSleepingArrangements: polyGroup.hideSleepingArrangements })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return {
    hideSleeping: group?.hideSleepingArrangements ?? false,
  };
}

async function archiveParentIfScheduleEmpty(
  tx: DbExecutor,
  parentId: string,
  actorUserId: string,
): Promise<void> {
  const [parent] = await tx.select().from(proposals).where(eq(proposals.id, parentId)).limit(1);
  if (!parent || parent.state !== "resolved") return;

  const slotRows = await tx
    .select()
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, parentId));

  const hasWindows = proposalHasSchedulableWindows(
    {
      id: parent.id,
      isAllDay: parent.isAllDay,
      isBatchSleeping: parent.isBatchSleeping,
      parentProposalId: parent.parentProposalId,
      isRecurrenceParent: parent.isRecurrenceParent,
      state: parent.state,
      scheduledStartAt: parent.scheduledStartAt,
      scheduledEndAt: parent.scheduledEndAt,
    },
    slotRows.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      label: slot.label,
      isDetached: slot.isDetached,
    })),
  );

  if (hasWindows) return;

  const now = new Date().toISOString();
  await tx
    .update(proposals)
    .set({ state: "archived", updatedAt: now })
    .where(eq(proposals.id, parentId));
  await logProposalTransition(tx, parentId, actorUserId, "proposal.archived", "All slices detached.");
}

function splitContiguousDateKeys(keys: string[]): string[][] {
  if (keys.length === 0) return [];
  const ranges: string[][] = [];
  let rangeStart = keys[0]!;
  let prev = keys[0]!;
  for (let i = 1; i < keys.length; i += 1) {
    const cur = keys[i]!;
    const nextOfPrev = new Date(`${prev}T00:00:00.000Z`);
    nextOfPrev.setUTCDate(nextOfPrev.getUTCDate() + 1);
    if (localDateKey(nextOfPrev.toISOString()) !== cur) {
      ranges.push([rangeStart, prev]);
      rangeStart = cur;
    }
    prev = cur;
  }
  ranges.push([rangeStart, prev]);
  return ranges;
}

/**
 * Loads day/night-scoped read model for virtual schedule slices (batch + multi-day span).
 */
export async function getProposalSliceDetailAction(
  input: z.infer<typeof sliceDetailSchema>,
): Promise<{ ok: boolean; message: string; detail?: ProposalSliceDetail }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = sliceDetailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid slice." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(session.user.role);
  const privacyFlags = await getSlicePrivacyFlags(db);
  const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);
  const partnerIds = await getAcceptedSleepingPartnerIds(db, session.user.id);
  const [viewerRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const viewerTimeZone = resolveTimezone(viewerRow?.timezone);
  const { rootProposalId, sliceKind, sliceKey } = parsed.data;
  const sliceTag = formatSliceTag(sliceKind, sliceKey);
  if (!sliceTag) {
    return { ok: false, message: "Invalid slice." };
  }

  const [row] = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      description: proposals.description,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationName: locations.name,
      locationText: proposals.locationText,
      intentionalSolo: proposals.intentionalSolo,
      isAllDay: proposals.isAllDay,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      isBatchSleeping: proposals.isBatchSleeping,
      batchEntriesJson: proposals.batchEntriesJson,
      atRisk: proposals.atRisk,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(eq(proposals.id, rootProposalId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Proposal not found." };
  }

  const inviteeRows = await db
    .select({
      userId: proposalInvitees.userId,
      displayName: users.displayName,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(eq(proposalInvitees.proposalId, rootProposalId));

  const inviteeUserIds = inviteeRows.map((invitee) => invitee.userId);
  const { visible, contentMasked: isContentMasked } = canViewProposalContent({
    viewerId: session.user.id,
    isAdmin,
    proposerId: row.proposerId,
    inviteeUserIds,
    proposalType: row.proposalType,
    state: row.state,
    adminCanSeeUninvolved,
    applyScheduleMask: true,
    hideSleeping: privacyFlags.hideSleeping,
    acceptedPartnerIds: partnerIds,
  });
  if (!visible) {
    return { ok: false, message: "Proposal not found." };
  }

  const slotRows = await db
    .select({
      id: proposalTimeSlots.id,
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
      isDetached: proposalTimeSlots.isDetached,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, rootProposalId));

  const membership = validateSliceMembership(
    {
      id: row.id,
      isBatchSleeping: row.isBatchSleeping,
      isAllDay: row.isAllDay,
      scheduledStartAt: row.scheduledStartAt,
      scheduledEndAt: row.scheduledEndAt,
    },
    slotRows,
    sliceKind,
    sliceKey,
    viewerTimeZone,
  );
  if (!membership.ok) {
    await logUserActivity(
      session.user.id,
      "schedule.slice_detail_error",
      JSON.stringify({
        rootProposalId,
        sliceKind,
        sliceKey,
        message: membership.message,
      }),
      "error",
    );
    return { ok: false, message: membership.message };
  }

  const display = applyProposalMask(row, isContentMasked);

  let startAt = row.scheduledStartAt ?? "";
  let endAt = row.scheduledEndAt;
  let locationName = row.locationName ?? row.locationText ?? null;
  let intentionalSolo = row.intentionalSolo;
  let participantNames = [row.proposerName, ...inviteeRows.map((invitee) => invitee.displayName)];

  if (sliceKind === "batch_night") {
    const slot = slotRows.find((entry) => entry.id === sliceKey);
    if (!slot || slot.isDetached) {
      return { ok: false, message: "Night not found." };
    }
    startAt = slot.startAt;
    endAt = slot.endAt;
    const meta = parseBatchSlotMeta(slot.label);
    if (meta) {
      intentionalSolo = meta.intentionalSolo ?? row.intentionalSolo;
      if (meta.intentionalSolo) {
        participantNames = [row.proposerName];
      } else {
        participantNames = [row.proposerName];
        for (const inviteeId of meta.inviteeUserIds) {
          const invitee = inviteeRows.find((entry) => entry.userId === inviteeId);
          if (invitee) participantNames.push(invitee.displayName);
        }
      }
      if (meta.locationText?.trim()) {
        locationName = meta.locationText.trim();
      } else if (meta.locationId) {
        const [place] = await db
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, meta.locationId))
          .limit(1);
        if (place) locationName = place.name;
      }
    }
  } else {
    const bounds = allDayBoundsForDateKey(sliceKey);
    startAt = bounds.startAt;
    endAt = bounds.endAt;
  }

  let sliceTitle = display.title;
  if (!isContentMasked && row.proposalType === "sleeping") {
    sliceTitle = formatSleepingDisplayTitle({
      proposerName: row.proposerName,
      inviteeNames: intentionalSolo ? [] : participantNames.slice(1),
      intentionalSolo,
      locationName,
      state: row.state === "archived" ? "resolved" : row.state,
      atRisk: row.atRisk,
    });
  }

  const commentRows = await db
    .select({
      id: proposalComments.id,
      body: proposalComments.body,
      createdAt: proposalComments.createdAt,
      authorName: users.displayName,
      sliceTag: proposalComments.sliceTag,
    })
    .from(proposalComments)
    .innerJoin(users, eq(proposalComments.authorId, users.id))
    .where(and(eq(proposalComments.proposalId, rootProposalId), isNull(proposalComments.deletedAt)))
    .orderBy(asc(proposalComments.createdAt));

  const visibleComments = isContentMasked
    ? []
    : commentRows
        .filter((comment) => !comment.sliceTag || comment.sliceTag === sliceTag)
        .map((comment) => ({
          id: comment.id,
          authorName: comment.authorName,
          body: comment.body,
          createdAt: comment.createdAt,
          sliceTag: comment.sliceTag ?? null,
        }));

  const viewerInvitee = inviteeRows.find((invitee) => invitee.userId === session.user.id);
  const canComment = canCommentOnProposal({
    state: row.state,
    isContentMasked,
  });
  const canVoteOnParent =
    !isContentMasked &&
    row.state === "proposed" &&
    viewerInvitee !== undefined &&
    viewerInvitee.voteStatus === "not_seen";

  return {
    ok: true,
    message: "Slice loaded.",
    detail: {
      rootProposalId,
      sliceKind,
      sliceKey,
      sliceTag,
      title: sliceTitle,
      description: isContentMasked ? null : proposalDescriptionForDisplay(row.description),
      locationName: isContentMasked ? null : locationName,
      startAt,
      endAt,
      isAllDay: sliceKind === "virtual_span_day" ? true : row.isAllDay,
      proposalType: row.proposalType,
      parentState: row.state,
      parentTitle: display.title,
      participantNames: isContentMasked ? [] : participantNames,
      intentionalSolo,
      isContentMasked,
      canComment,
      canDetach: !isContentMasked && row.state === "resolved",
      canVoteOnParent,
      comments: visibleComments,
    },
  };
}

/**
 * Materializes a resolved batch night or span day into its own proposal row.
 */
export async function detachProposalSliceAction(
  input: z.infer<typeof detachSliceSchema>,
): Promise<{ ok: boolean; message: string; newProposalId?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = detachSliceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid slice." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(session.user.role);
  const { rootProposalId, sliceKind, sliceKey } = parsed.data;
  const actor = actorNotifyFields(session.user);

  const [parent] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, rootProposalId))
    .limit(1);

  if (!parent || parent.state !== "resolved") {
    return { ok: false, message: "Only resolved proposals can be detached." };
  }

  const canManage = parent.proposerId === session.user.id || isAdmin;
  if (!canManage) {
    return { ok: false, message: "You cannot detach this slice." };
  }

  const [viewerRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const viewerTimeZone = resolveTimezone(viewerRow?.timezone);

  const parentSlots = await db
    .select({
      id: proposalTimeSlots.id,
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      isDetached: proposalTimeSlots.isDetached,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, rootProposalId));

  const membership = validateSliceMembership(
    {
      id: parent.id,
      isBatchSleeping: parent.isBatchSleeping,
      isAllDay: parent.isAllDay,
      scheduledStartAt: parent.scheduledStartAt,
      scheduledEndAt: parent.scheduledEndAt,
    },
    parentSlots,
    sliceKind,
    sliceKey,
    viewerTimeZone,
  );
  if (!membership.ok) {
    await logUserActivity(
      session.user.id,
      "schedule.slice_detach_error",
      JSON.stringify({
        rootProposalId,
        sliceKind,
        sliceKey,
        message: membership.message,
      }),
      "error",
    );
    return { ok: false, message: membership.message };
  }

  const [existingChild] = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        eq(proposals.detachedFromParentId, rootProposalId),
        eq(proposals.detachedFromSlotId, sliceKey),
      ),
    )
    .limit(1);

  if (existingChild) {
    return { ok: true, message: "Slice detached.", newProposalId: existingChild.id };
  }

  if (sliceKind === "batch_night" && !parent.isBatchSleeping) {
    return { ok: false, message: "Not a batch sleeping proposal." };
  }
  if (sliceKind === "virtual_span_day" && parent.isBatchSleeping) {
    return { ok: false, message: "Use batch night detach for sleeping batches." };
  }

  let newId: string;
  /** Notify after commit — in-tx notifyUser uses a separate getDb() and breaks libSQL (PC-147). */
  let notifyAfterCommit:
    | {
        proposalId: string;
        proposerId: string;
        title: string;
        message: string;
      }
    | undefined;

  try {
    newId = await db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const childId = `prop-${randomUUID()}`;

    if (sliceKind === "batch_night") {
      const [slot] = await tx
        .select()
        .from(proposalTimeSlots)
        .where(and(eq(proposalTimeSlots.proposalId, rootProposalId), eq(proposalTimeSlots.id, sliceKey)))
        .limit(1);

      if (!slot || slot.isDetached) {
        throw new Error("Night not found.");
      }

      const meta = parseBatchSlotMeta(slot.label);
      const batchEntries = parseBatchEntriesJson(parent.batchEntriesJson);
      const entry = meta
        ? batchEntries.find((item) => item.id === meta.batchEntryId)
        : undefined;

      await tx.insert(proposals).values({
        id: childId,
        title: parent.title,
        description: parent.description,
        proposalType: "sleeping",
        state: "resolved",
        proposerId: parent.proposerId,
        locationId: entry?.locationId ?? parent.locationId,
        locationText: entry?.locationText ?? parent.locationText,
        scheduledStartAt: slot.startAt,
        scheduledEndAt: slot.endAt,
        intentionalSolo: entry?.intentionalSolo ?? meta?.intentionalSolo ?? parent.intentionalSolo,
        eventPrivacy: parent.eventPrivacy,
        isPoll: false,
        isAllDay: parent.isAllDay,
        bedroomIndex: entry?.bedroomIndex ?? meta?.bedroomIndex ?? parent.bedroomIndex,
        notes: entry?.comment ?? parent.notes,
        detachedFromParentId: rootProposalId,
        detachedFromSlotId: sliceKey,
        detachedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(proposalTimeSlots).values({
        id: `pts-${randomUUID()}`,
        proposalId: childId,
        startAt: slot.startAt,
        endAt: slot.endAt,
        label: slot.label,
        sortOrder: 0,
        isAllDay: slot.isAllDay,
        createdAt: now,
      });

      const invitees =
        entry && !entry.intentionalSolo
          ? entry.invitees
          : meta && !meta.intentionalSolo
            ? meta.inviteeUserIds.map((userId) => ({ userId, role: "required" as const }))
            : [];

      for (const invitee of invitees) {
        if (invitee.userId === parent.proposerId) continue;
        await tx.insert(proposalInvitees).values({
          id: `pi-${randomUUID()}`,
          proposalId: childId,
          userId: invitee.userId,
          role: invitee.role,
          voteStatus: "accept",
          respondedAt: now,
          createdAt: now,
        });
      }

      await tx
        .update(proposalTimeSlots)
        .set({ isDetached: true })
        .where(eq(proposalTimeSlots.id, sliceKey));

      const nextEntries = meta
        ? batchEntries.filter((item) => item.id !== meta.batchEntryId)
        : batchEntries;
      await tx
        .update(proposals)
        .set({ batchEntriesJson: JSON.stringify(nextEntries), updatedAt: now })
        .where(eq(proposals.id, rootProposalId));

      await logProposalTransition(
        tx,
        rootProposalId,
        session.user.id,
        "proposal.child_detached",
        JSON.stringify({ childId, sliceKind, sliceKey }),
      );
      await logProposalTransition(
        tx,
        childId,
        session.user.id,
        "proposal.detached_from_parent",
        JSON.stringify({ parentId: rootProposalId, sliceKind, sliceKey }),
      );
      notifyAfterCommit = {
        proposalId: rootProposalId,
        proposerId: parent.proposerId,
        title: parent.title,
        message: `${actor.actorDisplayName} detached a night from "${parent.title}".`,
      };
    } else {
      const slotRows = await tx
        .select()
        .from(proposalTimeSlots)
        .where(eq(proposalTimeSlots.proposalId, rootProposalId))
        .orderBy(asc(proposalTimeSlots.sortOrder));

      const activeSlots = slotRows.filter((slot) => !slot.isDetached);
      let sourceStart = parent.scheduledStartAt;
      let sourceEnd = parent.scheduledEndAt;
      let sourceSlotId: string | null = null;

      if (activeSlots.length > 0) {
        const spanSlot =
          activeSlots.find((slot) =>
            expandAllDayDateKeys(slot.startAt, slot.endAt, viewerTimeZone).includes(sliceKey),
          ) ?? activeSlots[0]!;
        sourceStart = spanSlot.startAt;
        sourceEnd = spanSlot.endAt;
        sourceSlotId = spanSlot.id;
      }

      const bounds = allDayBoundsForDateKey(sliceKey);
      await tx.insert(proposals).values({
        id: childId,
        title: parent.title,
        description: parent.description,
        proposalType: parent.proposalType,
        state: "resolved",
        proposerId: parent.proposerId,
        locationId: parent.locationId,
        locationText: parent.locationText,
        scheduledStartAt: bounds.startAt,
        scheduledEndAt: bounds.endAt,
        intentionalSolo: parent.intentionalSolo,
        eventPrivacy: parent.eventPrivacy,
        isPoll: false,
        isAllDay: true,
        bedroomIndex: parent.bedroomIndex,
        notes: parent.notes,
        eventIconKey: parent.eventIconKey,
        detachedFromParentId: rootProposalId,
        detachedFromSlotId: sourceSlotId,
        detachedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(proposalTimeSlots).values({
        id: `pts-${randomUUID()}`,
        proposalId: childId,
        startAt: bounds.startAt,
        endAt: bounds.endAt,
        sortOrder: 0,
        isAllDay: true,
        createdAt: now,
      });

      const parentInvitees = await tx
        .select({ userId: proposalInvitees.userId, role: proposalInvitees.role })
        .from(proposalInvitees)
        .where(eq(proposalInvitees.proposalId, rootProposalId));

      for (const invitee of parentInvitees) {
        await tx.insert(proposalInvitees).values({
          id: `pi-${randomUUID()}`,
          proposalId: childId,
          userId: invitee.userId,
          role: invitee.role,
          voteStatus: "accept",
          respondedAt: now,
          createdAt: now,
        });
      }

      const allKeys = expandAllDayDateKeys(sourceStart!, sourceEnd, viewerTimeZone);
      const remainingKeys = allKeys.filter((key) => key !== sliceKey);
      const ranges = splitContiguousDateKeys(remainingKeys);

      if (sourceSlotId) {
        await tx.delete(proposalTimeSlots).where(eq(proposalTimeSlots.id, sourceSlotId));
      }

      let sortOrder = 0;
      for (const [rangeStart, rangeEnd] of ranges) {
        const startBounds = allDayBoundsForDateKey(rangeStart);
        const endBounds = allDayBoundsForDateKey(rangeEnd);
        await tx.insert(proposalTimeSlots).values({
          id: `pts-${randomUUID()}`,
          proposalId: rootProposalId,
          startAt: startBounds.startAt,
          endAt: endBounds.endAt,
          sortOrder,
          isAllDay: true,
          createdAt: now,
        });
        sortOrder += 1;
      }

      const parentStart = ranges[0]?.[0] ? allDayBoundsForDateKey(ranges[0][0]).startAt : null;
      const parentEnd = ranges.at(-1)?.[1]
        ? allDayBoundsForDateKey(ranges.at(-1)![1]).endAt
        : null;

      await tx
        .update(proposals)
        .set({
          scheduledStartAt: parentStart,
          scheduledEndAt: parentEnd,
          updatedAt: now,
        })
        .where(eq(proposals.id, rootProposalId));

      await logProposalTransition(
        tx,
        rootProposalId,
        session.user.id,
        "proposal.child_detached",
        JSON.stringify({ childId, sliceKind, sliceKey }),
      );
      await logProposalTransition(
        tx,
        childId,
        session.user.id,
        "proposal.detached_from_parent",
        JSON.stringify({ parentId: rootProposalId, sliceKind, sliceKey }),
      );
      notifyAfterCommit = {
        proposalId: rootProposalId,
        proposerId: parent.proposerId,
        title: parent.title,
        message: `${actor.actorDisplayName} detached a day from "${parent.title}".`,
      };
    }

    await archiveParentIfScheduleEmpty(tx, rootProposalId, session.user.id);
    return childId;
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Detach failed.";
    return {
      ok: false,
      message: detail.startsWith("Failed query")
        ? `Detach failed (database). ${detail}`
        : detail,
    };
  }

  if (notifyAfterCommit) {
    try {
      await notifyProposalParticipants(db, {
        proposalId: notifyAfterCommit.proposalId,
        proposerId: notifyAfterCommit.proposerId,
        notificationType: "proposal_child_detached",
        message: notifyAfterCommit.message,
        metadata: { proposalTitle: notifyAfterCommit.title, ...actor },
      });
    } catch {
      // Detach already committed — do not fail the action on notification errors.
    }
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Slice detached.", newProposalId: newId };
}
