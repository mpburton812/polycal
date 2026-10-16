import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { adminAccessFromSessionUser, adminAccessFromUserRow, userHasAdminAccess, type AdminAccessSession } from "@/lib/admin-access";
import { latestIcsPendingIdsByProposal } from "@/lib/calendar/pending-ics";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { requireNetworkSession } from "@/lib/networks/context";
import { legacyRolesForUsers } from "@/lib/networks/membership";
import { listNetworkPickerPlaces } from "@/lib/places/list-network-picker-places";
import {
  locations,
  networkMembers,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  users,
  type InviteeRole,
  type InviteeVoteStatus,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { actorNotifyFields, notifyUser } from "@/lib/notifications";
import { resolveTimezone } from "@/lib/schedule/timezone";
import {
  submitNotificationMessage,
  submitResultMessage,
} from "@/lib/proposals/submit-copy";
import { dismissNotificationsForProposal } from "@/actions/notifications";
import { formatConflictMessage } from "@/lib/proposals/conflict-message";
import {
  detectViewerOverlapWarning,
  runProposalEnforcement,
} from "@/lib/proposals/enforcement";
import {
  recordProposalInviteeView,
  shouldRecordProposalInviteeView,
} from "@/lib/proposals/invitee-view";
import {
  sleepingDateToStartIso,
  isoToSleepingDateInput,
  sleepingScheduleFromSlotRows,
} from "@/lib/proposals/sleeping-schedule";
import {
  batchSleepingEntriesSchema,
  parseBatchEntriesJson,
  parseBatchSlotMeta,
  unionBatchInvitees,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping";
import {
  createBatchSleepingDraft,
  persistBatchSleepingDraft as persistBatchSleepingDraftCore,
  updateBatchSleepingDraft,
  validateBatchSleepingEntries,
} from "@/lib/proposals/fast-sleeping-core";
import { canProxyVoteForPassiveInvitee, actorCanProxyVoteSync } from "@/lib/proposals/passive-proxy-vote";
import { canManageSleepingAttendees } from "@/lib/proposals/passive-auto-accept";
import { enterAtRiskProposedState } from "@/lib/proposals/services/at-risk";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { wipeProposalVotes } from "@/lib/proposals/services/votes";
import {
  getAcceptedSleepingPartnerIds as loadAcceptedSleepingPartnerIds,
  getAcceptedSleepingPartnerIdsForUsers as loadAcceptedSleepingPartnerIdsForUsers,
  getEligibleLocationIdsForUser as loadEligibleLocationIdsForUser,
  getEligibleLocationIdsForUsers as loadEligibleLocationIdsForUsers,
} from "@/lib/proposals/partners";
import {
  getAdminCanSeeUninvolved,
  isPartnerOnlySleepingViewer,
  viewerCanSeeAuditLog,
  viewerCanSeeProposalWithSleepingGate,
} from "@/lib/proposals/access";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { assertComposerPostingRules } from "@/lib/proposals/composer-posting-rules";
import { bookingsEnabled } from "@/types/network-settings";
import { buildPartnershipProposalCopy } from "@/lib/partnerships/copy";
import type { UserRole } from "@/types/user";

import {
  draftProposalSchema,
  slotVoteSchema,
  voteSchema,
} from "./schemas";
import type {
  ProposalBoard,
  ProposalCard,
  ProposalConflictWarning,
  ProposalDetail,
  ProposalPlaceOption,
  ProposalStateLogView,
  RecurrencePattern,
  RecurrenceRule,
} from "./types";
import { APPROVING_VOTES } from "@/lib/proposals/constants";
import { gatherProposalConflictWarnings } from "@/lib/proposals/services/conflicts";
import {
  buildSleepingProposalTitle,
  evaluateProposalAfterVote,
  resolveProposal,
  scheduleFromSlots,
  syncInviteeAggregateFromSlotVotes,
} from "@/lib/proposals/services/resolution";


/**
 * Public list of accepted sleeping partner ids for the signed-in user, or for a
 * Booking-for subject the actor is allowed to proxy (PC-494).
 */

import { enrichPlaceOptionsWithMembers, mapPlaceOption } from "./_helpers";


export async function persistBatchSleepingDraft(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  entries: BatchSleepingEntry[],
): Promise<void> {
  await persistBatchSleepingDraftCore(db, proposalId, entries);
}

/**
 * Validates the viewer may use a location on a proposal.
 */
export async function assertLocationAllowed(
  db: ReturnType<typeof getDb>,
  userId: string,
  access: AdminAccessSession | string,
  locationId: string | undefined,
  locationText?: string,
  networkId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (locationId && locationText?.trim()) {
    return { ok: false, error: "Choose either a registered place or custom location text, not both." };
  }
  if (!locationId) return { ok: true };

  const locationFilters = [eq(locations.id, locationId)];
  if (networkId) {
    locationFilters.push(eq(locations.networkId, networkId));
  }
  const [place] = await db
    .select()
    .from(locations)
    .where(and(...locationFilters))
    .limit(1);
  if (!place) {
    return { ok: false, error: "Selected place was not found." };
  }

  const adminAccess =
    typeof access === "string" ? adminAccessFromUserRow({ role: access }) : access;
  if (await userHasAdminAccess(adminAccess)) {
    return { ok: true };
  }

  const eligibleIds = await loadEligibleLocationIdsForUser(db, userId, networkId);
  if (!eligibleIds.includes(locationId)) {
    return {
      ok: false,
      error:
        "You can only schedule at places you or your sleeping partners are associated with.",
    };
  }

  return { ok: true };
}

export async function replaceInvitees(
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

  if (uniqueInvitees.length === 0) return;

  // Batch insert — one RTT for all invitees (PC-397).
  await db.insert(proposalInvitees).values(
    uniqueInvitees.map((invitee) => ({
      id: `pi-${randomUUID()}`,
      proposalId,
      userId: invitee.userId,
      role: invitee.role,
      voteStatus: "not_seen" as const,
      addedByUserId: proposerId,
      createdAt: now,
    })),
  );
}

export async function replaceTimeSlots(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  slots: {
    startAt: string;
    endAt?: string;
    label?: string;
    sortOrder?: number;
    isAllDay?: boolean;
  }[],
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  const now = new Date().toISOString();

  if (slots.length === 0) return;

  // Batch insert — one RTT for all slots (PC-397).
  await db.insert(proposalTimeSlots).values(
    slots.map((slot, index) => ({
      id: `pts-${randomUUID()}`,
      proposalId,
      startAt: slot.startAt,
      endAt: slot.endAt ?? null,
      label: slot.label ?? null,
      sortOrder: slot.sortOrder ?? index,
      isAllDay: slot.isAllDay ?? false,
      createdAt: now,
    })),
  );
}

/**
 * Deletes non-parent recurrence children (and their invitees/slots/votes) so a
 * re-submit can recreate the series without duplicates (PC-494).
 */
export async function deleteRecurringChildProposals(
  db: ReturnType<typeof getDb>,
  parentProposalId: string,
): Promise<void> {
  const children = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.parentProposalId, parentProposalId));
  if (children.length === 0) return;

  const childIds = children.map((row) => row.id);
  const { calendarEventLinks, calendarIcsPending, proposalCommentImages } = await import(
    "@/lib/db/schema"
  );
  await db.delete(calendarEventLinks).where(inArray(calendarEventLinks.proposalId, childIds));
  await db.delete(calendarIcsPending).where(inArray(calendarIcsPending.proposalId, childIds));
  await db.delete(proposalSlotVotes).where(inArray(proposalSlotVotes.proposalId, childIds));
  await db.delete(proposalTimeSlots).where(inArray(proposalTimeSlots.proposalId, childIds));
  await db.delete(proposalInvitees).where(inArray(proposalInvitees.proposalId, childIds));
  const commentIds = (
    await db
      .select({ id: proposalComments.id })
      .from(proposalComments)
      .where(inArray(proposalComments.proposalId, childIds))
  ).map((row) => row.id);
  if (commentIds.length > 0) {
    await db
      .delete(proposalCommentImages)
      .where(inArray(proposalCommentImages.commentId, commentIds));
  }
  await db.delete(proposalComments).where(inArray(proposalComments.proposalId, childIds));
  await db.delete(proposalStateLog).where(inArray(proposalStateLog.proposalId, childIds));
  await db.delete(proposals).where(inArray(proposals.id, childIds));
}

/**
 * Creates child proposal drafts for recurring series occurrences after the parent (PC-40).
 */
export async function createRecurringChildProposals(
  db: ReturnType<typeof getDb>,
  parent: typeof proposals.$inferSelect,
  occurrences: { startAt: string; endAt: string | null }[],
  invitees: { userId: string; role: InviteeRole }[],
): Promise<void> {
  const now = new Date().toISOString();
  for (let index = 1; index < occurrences.length; index += 1) {
    const occurrence = occurrences[index];
    const childId = `prop-${randomUUID()}`;
    const label = new Date(occurrence.startAt).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    await db.insert(proposals).values({
      id: childId,
      networkId: parent.networkId,
      title: `${parent.title} — ${label}`,
      description: parent.description,
      proposalType: parent.proposalType,
      state: parent.state,
      proposerId: parent.proposerId,
      locationId: parent.locationId,
      scheduledStartAt: parent.state === "resolved" ? occurrence.startAt : null,
      scheduledEndAt: parent.state === "resolved" ? occurrence.endAt : null,
      intentionalSolo: parent.intentionalSolo,
      eventPrivacy: parent.eventPrivacy,
      isPoll: false,
      isAllDay: parent.isAllDay ?? false,
      parentProposalId: parent.id,
      occurrenceIndex: index,
      isRecurrenceParent: false,
      bedroomIndex: parent.bedroomIndex,
      notes: parent.notes,
      eventIconKey: parent.eventIconKey,
      scheduleColor: parent.scheduleColor,
      postingKind: parent.postingKind,
      onBehalfOfUserId: parent.onBehalfOfUserId,
      tentative: parent.tentative ?? false,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId: childId,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      label,
      sortOrder: 0,
      createdAt: now,
    });

    if (invitees.length > 0) {
      await replaceInvitees(db, childId, parent.proposerId, invitees);
    }

    await logProposalTransition(
      db,
      childId,
      parent.proposerId,
      "proposal.recurrence_child_created",
      JSON.stringify({ parentId: parent.id, occurrenceIndex: index }),
    );
  }
}

/**
 * Creates a new draft proposal for the signed-in user (PC-40).
 */
export async function loadAllowedProxyUserIds(
  db: ReturnType<typeof getDb>,
  actorId: string,
  networkId: string,
  scope: "anyone" | "sleeping_partners",
): Promise<Set<string>> {
  if (scope === "sleeping_partners") {
    return loadAcceptedSleepingPartnerIds(db, actorId, networkId);
  }
  const rows = await db
    .select({ userId: networkMembers.userId })
    .from(networkMembers)
    .where(and(eq(networkMembers.networkId, networkId), eq(networkMembers.status, "active")));
  return new Set(rows.map((row) => row.userId).filter((id) => id !== actorId));
}

export async function validateComposerPosting(
  db: ReturnType<typeof getDb>,
  networkId: string,
  actorId: string,
  input: {
    isPoll: boolean;
    postingKind: "proposal" | "booking";
    onBehalfOfUserId?: string | null;
  },
  isExistingPollDraft: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await loadNetworkSettings(networkId, db);
  const allowedProxyUserIds = await loadAllowedProxyUserIds(
    db,
    actorId,
    networkId,
    settings?.proxySchedulingScope ?? "sleeping_partners",
  );
  return assertComposerPostingRules({
    pollEnabled: settings?.pollEnabled !== false,
    schedulingPosting: settings?.schedulingPosting ?? "proposals_only",
    proxySchedulingEnabled: Boolean(settings?.proxySchedulingEnabled),
    proxySchedulingScope: settings?.proxySchedulingScope ?? "sleeping_partners",
    isPoll: input.isPoll,
    isExistingPollDraft,
    postingKind: input.postingKind,
    onBehalfOfUserId: input.onBehalfOfUserId,
    actorUserId: actorId,
    allowedProxyUserIds,
  });
}
