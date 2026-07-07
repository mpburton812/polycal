"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locations,
  proposalComments,
  proposalInvitees,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  users,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import {
  parseBatchEntriesJson,
  parseBatchSlotMeta,
} from "@/lib/proposals/batch-sleeping";
import {
  applyProposalMask,
  getPrivacyAdminFlags,
  shouldMaskProposalContent,
  viewerCanSeeProposal,
} from "@/lib/proposals/access";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import { proposalDescriptionForDisplay } from "@/lib/proposals/special-proposals";
import {
  allDayBoundsForDateKey,
  expandAllDayDateKeys,
  isMultiDayAllDaySpan,
} from "@/lib/schedule/schedule-slices";
import { formatSliceTag } from "@/lib/schedule/slice-types";
import { localDateKey } from "@/lib/schedule/dates";
import type { ProposalSliceDetail } from "./slice-types";

const sliceDetailSchema = z.object({
  rootProposalId: z.string().min(1),
  sliceKind: z.enum(["batch_night", "virtual_span_day"]),
  sliceKey: z.string().min(1),
});

const detachSliceSchema = sliceDetailSchema;

async function logProposalTransition(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  actorUserId: string,
  action: string,
  details?: string,
): Promise<void> {
  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId,
    action,
    details: details ?? null,
    createdAt: new Date().toISOString(),
  });
}

async function notifyStakeholders(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  proposerId: string,
  title: string,
  notificationType: string,
  message: string,
): Promise<void> {
  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));
  const notifyIds = new Set<string>([proposerId, ...invitees.map((row) => row.userId)]);
  for (const userId of notifyIds) {
    await notifyUser(userId, notificationType, message, { proposalId, proposalTitle: title });
  }
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
  const privacyFlags = await getPrivacyAdminFlags(db);
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
      eventPrivacy: proposals.eventPrivacy,
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
  if (
    !viewerCanSeeProposal(session.user.id, isAdmin, row.proposerId, inviteeUserIds, {
      state: row.state,
      eventPrivacy: row.eventPrivacy,
    })
  ) {
    return { ok: false, message: "Proposal not found." };
  }

  const masked = shouldMaskProposalContent(
    session.user.id,
    isAdmin,
    row.proposerId,
    inviteeUserIds,
    row.eventPrivacy,
    privacyFlags.adminCanSeePrivate,
    privacyFlags.adminCanSeeSuperPrivate,
    row.state,
  );
  const display = applyProposalMask(row, masked);

  let startAt = row.scheduledStartAt ?? "";
  let endAt = row.scheduledEndAt;
  let locationName = row.locationName ?? row.locationText ?? null;
  let intentionalSolo = row.intentionalSolo;
  let participantNames = [row.proposerName, ...inviteeRows.map((invitee) => invitee.displayName)];

  if (sliceKind === "batch_night") {
    const [slot] = await db
      .select()
      .from(proposalTimeSlots)
      .where(and(eq(proposalTimeSlots.proposalId, rootProposalId), eq(proposalTimeSlots.id, sliceKey)))
      .limit(1);
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
  if (!masked && row.proposalType === "sleeping") {
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
    .where(eq(proposalComments.proposalId, rootProposalId))
    .orderBy(asc(proposalComments.createdAt));

  const visibleComments = masked
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
  const canComment =
    !masked &&
    (row.proposerId === session.user.id ||
      isAdmin ||
      inviteeUserIds.includes(session.user.id) ||
      row.eventPrivacy === "open");
  const canVoteOnParent =
    !masked &&
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
      description: masked ? null : proposalDescriptionForDisplay(row.description),
      locationName: masked ? null : locationName,
      startAt,
      endAt,
      isAllDay: sliceKind === "virtual_span_day" ? true : row.isAllDay,
      proposalType: row.proposalType,
      parentState: row.state,
      parentTitle: display.title,
      participantNames: masked ? [] : participantNames,
      intentionalSolo,
      isContentMasked: masked,
      canComment,
      canDetach: !masked && row.state === "resolved",
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

  const now = new Date().toISOString();
  const newId = `prop-${randomUUID()}`;

  if (sliceKind === "batch_night") {
    if (!parent.isBatchSleeping) {
      return { ok: false, message: "Not a batch sleeping proposal." };
    }

    const [slot] = await db
      .select()
      .from(proposalTimeSlots)
      .where(and(eq(proposalTimeSlots.proposalId, rootProposalId), eq(proposalTimeSlots.id, sliceKey)))
      .limit(1);

    if (!slot || slot.isDetached) {
      return { ok: false, message: "Night not found." };
    }

    const meta = parseBatchSlotMeta(slot.label);
    const batchEntries = parseBatchEntriesJson(parent.batchEntriesJson);
    const entry = meta
      ? batchEntries.find((item) => item.id === meta.batchEntryId)
      : undefined;

    await db.insert(proposals).values({
      id: newId,
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

    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId: newId,
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
      await db.insert(proposalInvitees).values({
        id: `pi-${randomUUID()}`,
        proposalId: newId,
        userId: invitee.userId,
        role: invitee.role,
        voteStatus: "accept",
        respondedAt: now,
        createdAt: now,
      });
    }

    await db
      .update(proposalTimeSlots)
      .set({ isDetached: true })
      .where(eq(proposalTimeSlots.id, sliceKey));

    const nextEntries = meta
      ? batchEntries.filter((item) => item.id !== meta.batchEntryId)
      : batchEntries;
    await db
      .update(proposals)
      .set({ batchEntriesJson: JSON.stringify(nextEntries), updatedAt: now })
      .where(eq(proposals.id, rootProposalId));

    await logProposalTransition(
      db,
      rootProposalId,
      session.user.id,
      "proposal.child_detached",
      JSON.stringify({ childId: newId, sliceKind, sliceKey }),
    );
    await logProposalTransition(
      db,
      newId,
      session.user.id,
      "proposal.detached_from_parent",
      JSON.stringify({ parentId: rootProposalId, sliceKind, sliceKey }),
    );
    await notifyStakeholders(
      db,
      rootProposalId,
      parent.proposerId,
      parent.title,
      "proposal_child_detached",
      `A night was detached from "${parent.title}".`,
    );
  } else {
    if (parent.isBatchSleeping) {
      return { ok: false, message: "Use batch night detach for sleeping batches." };
    }

    const slotRows = await db
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
          expandAllDayDateKeys(slot.startAt, slot.endAt).includes(sliceKey),
        ) ?? activeSlots[0]!;
      sourceStart = spanSlot.startAt;
      sourceEnd = spanSlot.endAt;
      sourceSlotId = spanSlot.id;
    }

    if (
      !sourceStart ||
      !isMultiDayAllDaySpan(sourceStart, sourceEnd ?? sourceStart, parent.isAllDay)
    ) {
      return { ok: false, message: "Day not part of a multi-day span." };
    }

    const allKeys = expandAllDayDateKeys(sourceStart, sourceEnd);
    if (!allKeys.includes(sliceKey)) {
      return { ok: false, message: "Day not found in span." };
    }

    const bounds = allDayBoundsForDateKey(sliceKey);
    await db.insert(proposals).values({
      id: newId,
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
      detachedFromParentId: rootProposalId,
      detachedFromSlotId: sourceSlotId,
      detachedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId: newId,
      startAt: bounds.startAt,
      endAt: bounds.endAt,
      sortOrder: 0,
      isAllDay: true,
      createdAt: now,
    });

    const parentInvitees = await db
      .select({ userId: proposalInvitees.userId, role: proposalInvitees.role })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, rootProposalId));

    for (const invitee of parentInvitees) {
      await db.insert(proposalInvitees).values({
        id: `pi-${randomUUID()}`,
        proposalId: newId,
        userId: invitee.userId,
        role: invitee.role,
        voteStatus: "accept",
        respondedAt: now,
        createdAt: now,
      });
    }

    const remainingKeys = allKeys.filter((key) => key !== sliceKey);
    const ranges = splitContiguousDateKeys(remainingKeys);

    if (sourceSlotId) {
      await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.id, sourceSlotId));
    }

    let sortOrder = 0;
    for (const [rangeStart, rangeEnd] of ranges) {
      const startBounds = allDayBoundsForDateKey(rangeStart);
      const endBounds = allDayBoundsForDateKey(rangeEnd);
      await db.insert(proposalTimeSlots).values({
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

    await db
      .update(proposals)
      .set({
        scheduledStartAt: parentStart,
        scheduledEndAt: parentEnd,
        updatedAt: now,
      })
      .where(eq(proposals.id, rootProposalId));

    await logProposalTransition(
      db,
      rootProposalId,
      session.user.id,
      "proposal.child_detached",
      JSON.stringify({ childId: newId, sliceKind, sliceKey }),
    );
    await logProposalTransition(
      db,
      newId,
      session.user.id,
      "proposal.detached_from_parent",
      JSON.stringify({ parentId: rootProposalId, sliceKind, sliceKey }),
    );
    await notifyStakeholders(
      db,
      rootProposalId,
      parent.proposerId,
      parent.title,
      "proposal_child_detached",
      `A day was detached from "${parent.title}".`,
    );
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Slice detached.", newProposalId: newId };
}
