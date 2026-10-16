"use server";

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

import {
  assertSleepingInviteesAllowed,
  buildRecurrenceOccurrences,
  criticalProposalFieldsChanged,
  mapPlaceOption,
  parseBedroomNames,
  parseRecurrenceRule,
  serializeRecurrenceRule,
} from "./_helpers";

import { optionalInviteeVotesPending } from "@/lib/proposals/poll-utils";

/**
 * Loads proposal detail for view, edit, or voting (PC-40).
 */
export async function getProposalDetailAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; detail?: ProposalDetail }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  const adminCanSeeUninvolved = await getAdminCanSeeUninvolved(db);

  const [row] = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      description: proposals.description,
      notes: proposals.notes,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationId: proposals.locationId,
      locationText: proposals.locationText,
      locationName: locations.name,
      intentionalSolo: proposals.intentionalSolo,
      isPoll: proposals.isPoll,
      isAllDay: proposals.isAllDay,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      winningSlotId: proposals.winningSlotId,
      parentProposalId: proposals.parentProposalId,
      recurrenceRule: proposals.recurrenceRule,
      occurrenceIndex: proposals.occurrenceIndex,
      isRecurrenceParent: proposals.isRecurrenceParent,
      bedroomIndex: proposals.bedroomIndex,
      isBatchSleeping: proposals.isBatchSleeping,
      batchEntriesJson: proposals.batchEntriesJson,
      reminderOffsetMinutes: proposals.reminderOffsetMinutes,
      eventIconKey: proposals.eventIconKey,
      scheduleColor: proposals.scheduleColor,
      postToFeed: proposals.postToFeed,
      postingKind: proposals.postingKind,
      onBehalfOfUserId: proposals.onBehalfOfUserId,
      tentative: proposals.tentative,
      networkId: proposals.networkId,
      locationBedroomNames: locations.bedroomNames,
      locationBedroomCount: locations.bedroomCount,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Proposal not found." };
  }

  const networkSettings = row.networkId ? await loadNetworkSettings(row.networkId, db) : null;

  const inviteeBase = await db
    .select({
      userId: proposalInvitees.userId,
      displayName: users.displayName,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
      viewedAt: proposalInvitees.viewedAt,
      overlapAcknowledgedAt: proposalInvitees.overlapAcknowledgedAt,
      addedByUserId: proposalInvitees.addedByUserId,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(eq(proposalInvitees.proposalId, proposalId));
  const inviteeRoles = await legacyRolesForUsers(inviteeBase.map((invitee) => invitee.userId));
  const inviteeRows = inviteeBase.map((invitee) => ({
    ...invitee,
    userRole: inviteeRoles.get(invitee.userId) ?? "user",
  }));

  const inviteeUserIds = inviteeRows.map((invitee) => invitee.userId);
  if (row.state === "draft" && row.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Proposal not found." };
  }
  if (
    (row.state === "proposed" || row.state === "resolved" || row.state === "archived") &&
    !viewerCanSeeProposalWithSleepingGate(session.user.id, isAdmin, row.proposerId, inviteeUserIds, {
      proposalType: row.proposalType,
      state: row.state,
      adminCanSeeUninvolved,
    })
  ) {
    // Partner-only schedule viewers can see the block but not open detail (PC-399).
    if (
      networkSettings?.seePartnersSleepingArrangements &&
      isSleepingLikeType(row.proposalType)
    ) {
      const partnerIds = await loadAcceptedSleepingPartnerIds(
        db,
        session.user.id,
        row.networkId ?? undefined,
      );
      if (
        isPartnerOnlySleepingViewer(
          session.user.id,
          row.proposerId,
          inviteeUserIds,
          partnerIds,
        )
      ) {
        return {
          ok: false,
          message: "You do not have access to this event's detail.",
        };
      }
    }
    return { ok: false, message: "Proposal not found." };
  }

  const display = row;
  const userFacingDescription = row.description;
  // Detail dialog never applies schedule sleeping mask (PC-306) — content stays unmasked.

  // Preload sleeping partners for each proxy (passive) invitee so UI can show vote controls (PC-255 / PC-397).
  const proxyPartnerIdsByUser = new Map<string, Set<string>>();
  const passiveUserIds = [
    ...new Set(
      inviteeRows.filter((invitee) => invitee.userRole === "passive").map((invitee) => invitee.userId),
    ),
  ];
  if (passiveUserIds.length > 0) {
    const partnersByUser = await loadAcceptedSleepingPartnerIdsForUsers(db, passiveUserIds);
    for (const userId of passiveUserIds) {
      proxyPartnerIdsByUser.set(userId, partnersByUser.get(userId) ?? new Set());
    }
  }

  const slotRows = await db
    .select()
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId))
    .orderBy(asc(proposalTimeSlots.sortOrder));

  const slotVoteRows = await db
    .select({
      timeSlotId: proposalSlotVotes.timeSlotId,
      userId: proposalSlotVotes.userId,
      displayName: users.displayName,
      voteStatus: proposalSlotVotes.voteStatus,
    })
    .from(proposalSlotVotes)
    .innerJoin(users, eq(proposalSlotVotes.userId, users.id))
    .where(eq(proposalSlotVotes.proposalId, proposalId));

  const viewerInvitee = inviteeRows.find((invitee) => invitee.userId === session.user.id);
  if (
    viewerInvitee &&
    shouldRecordProposalInviteeView({
      proposalState: row.state,
      masked: false,
      isInvitee: true,
      viewedAt: viewerInvitee.viewedAt,
    })
  ) {
    const viewedAt = await recordProposalInviteeView(db, proposalId, session.user.id);
    viewerInvitee.viewedAt = viewedAt;
    const inviteeIndex = inviteeRows.findIndex((invitee) => invitee.userId === session.user.id);
    if (inviteeIndex >= 0) {
      inviteeRows[inviteeIndex].viewedAt = viewedAt;
    }
  }

  const viewerSlotVotes: Record<string, InviteeVoteStatus> = {};
  for (const vote of slotVoteRows.filter((v) => v.userId === session.user.id)) {
    viewerSlotVotes[vote.timeSlotId] = vote.voteStatus;
  }

  const isPollMatrix = row.isPoll && slotRows.length > 1;
  const pollSlotsIncomplete =
    isPollMatrix &&
    slotRows.some((slot) => !viewerSlotVotes[slot.id] || viewerSlotVotes[slot.id] === "not_seen");

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
    .where(and(eq(proposalComments.proposalId, proposalId), isNull(proposalComments.deletedAt)))
    .orderBy(asc(proposalComments.createdAt));

  const logRows = await db
    .select({
      action: proposalStateLog.action,
      details: proposalStateLog.details,
      createdAt: proposalStateLog.createdAt,
      actorName: users.displayName,
    })
    .from(proposalStateLog)
    .leftJoin(users, eq(proposalStateLog.actorUserId, users.id))
    .where(eq(proposalStateLog.proposalId, proposalId))
    .orderBy(asc(proposalStateLog.createdAt));

  const isProposer = row.proposerId === session.user.id;
  const isInvitee = inviteeUserIds.includes(session.user.id);
  const canManage = isProposer || isAdmin;
  const recurrenceRule = parseRecurrenceRule(row.recurrenceRule);

  const stateLogEntries = logRows.map((entry) => ({
    action: entry.action,
    actorName: entry.actorName ?? null,
    details: entry.details ?? null,
    createdAt: entry.createdAt,
  }));

  const hasOverlapWarning = await detectViewerOverlapWarning(
    db,
    proposalId,
    session.user.id,
    viewerInvitee?.voteStatus,
    viewerInvitee?.overlapAcknowledgedAt,
    display.scheduledStartAt ?? null,
    display.scheduledEndAt ?? null,
    row.proposalType,
    row.isAllDay,
  );

  const optionalRsvpPending = optionalInviteeVotesPending(row, viewerInvitee);
  const displayState: ProposalState = optionalRsvpPending ? "proposed" : row.state;
  const batchEntries = parseBatchEntriesJson(row.batchEntriesJson);
  const batchLocationIds = [
    ...new Set(
      batchEntries
        .map((entry) => entry.locationId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const batchPlaceRows =
    batchLocationIds.length > 0
      ? await db
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(inArray(locations.id, batchLocationIds))
      : [];
  const batchPlaceNames = Object.fromEntries(
    batchPlaceRows.map((place) => [place.id, place.name]),
  );

  let detailTitle = display.title;
  if (row.proposalType === "sleeping") {
    detailTitle = await buildSleepingProposalTitle(db, {
      proposerName: row.proposerName,
      intentionalSolo: row.intentionalSolo,
      locationId: row.locationId,
      locationText: row.locationText,
      locationName: row.locationName ?? row.locationText,
      state: row.state,
      atRisk: row.atRisk,
      inviteeUserIds: inviteeRows.map((invitee) => invitee.userId),
      batchEntries: batchEntries.length > 0 ? batchEntries : undefined,
    });
  }
  const { formatTentativeTitle } = await import("@/lib/proposals/tentative-title");
  detailTitle = formatTentativeTitle(detailTitle, Boolean(row.tentative));
  const canRenameOrTentative =
    row.state !== "archived" && (isProposer || isInvitee || isAdmin);

  return {
    ok: true,
    message: "Loaded.",
    detail: {
      id: row.id,
      title: detailTitle,
      description: userFacingDescription,
      notes:
        isProposer || isInvitee || isAdmin || row.state === "resolved"
          ? row.notes
          : null,
      proposalType: row.proposalType,
      state: row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationId: row.locationId ?? null,
      locationText: row.locationText ?? null,
      locationName: display.locationName ?? display.locationText ?? null,
      intentionalSolo: row.intentionalSolo,
      isPoll: row.isPoll,
      isAllDay: row.isAllDay,
      scheduledStartAt: display.scheduledStartAt ?? null,
      scheduledEndAt: display.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      isContentMasked: false,
      isRecurring: Boolean(recurrenceRule || row.parentProposalId),
      isRecurrenceParent: row.isRecurrenceParent,
      parentProposalId: row.parentProposalId ?? null,
      recurrenceRule,
      occurrenceIndex: row.occurrenceIndex ?? null,
      bedroomIndex: row.bedroomIndex ?? null,
      bedroomLabel:
        row.proposalType !== "sleeping" || row.bedroomIndex === null
          ? null
          : (() => {
              const names = parseBedroomNames(row.locationBedroomNames);
              const labels =
                names.length > 0
                  ? names
                  : Array.from(
                      { length: row.locationBedroomCount ?? 0 },
                      (_, index) => `Bedroom ${index + 1}`,
                    );
              return labels[row.bedroomIndex!] ?? `Bedroom ${row.bedroomIndex! + 1}`;
            })(),
      isBatchSleeping: row.isBatchSleeping,
      batchEntries,
      batchPlaceNames,
      invitees: inviteeRows.map((invitee) => ({
        userId: invitee.userId,
        displayName: invitee.displayName,
        role: invitee.role,
        voteStatus: invitee.voteStatus,
        viewedAt: invitee.viewedAt ?? null,
        userRole: invitee.userRole,
        addedByUserId: invitee.addedByUserId ?? null,
        canProxyVote:
          invitee.userRole === "passive" &&
          (row.state === "proposed" || row.state === "resolved") &&
          actorCanProxyVoteSync({
            isAdmin,
            actorUserId: session.user.id,
            proposerId: row.proposerId,
            sleepingPartnerIds: proxyPartnerIdsByUser.get(invitee.userId) ?? new Set(),
          }),
      })),
      timeSlots: slotRows.map((slot) => ({
        id: slot.id,
        startAt: slot.startAt,
        endAt: slot.endAt ?? null,
        label: slot.label ?? null,
        isAllDay: slot.isAllDay ?? false,
      })),
      slotVotes: slotVoteRows.map((vote) => ({
        timeSlotId: vote.timeSlotId,
        userId: vote.userId,
        displayName: vote.displayName,
        voteStatus: vote.voteStatus,
      })),
      winningSlotId: row.winningSlotId ?? null,
      comments: commentRows.map((comment) => ({
        id: comment.id,
        authorName: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
        sliceTag: comment.sliceTag ?? null,
      })),
      stateLog: stateLogEntries,
      canEdit: row.state === "draft" && (isProposer || isAdmin),
      canVote:
        !isPollMatrix &&
        ((row.state === "proposed" &&
          viewerInvitee !== undefined &&
          viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            !row.atRisk &&
            viewerInvitee?.role === "required" &&
            viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            row.atRisk &&
            viewerInvitee?.role === "required" &&
            viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            viewerInvitee?.role === "optional" &&
            viewerInvitee.voteStatus === "not_seen")),
      canVoteSlots:
        isPollMatrix &&
        viewerInvitee !== undefined &&
        (row.state === "proposed" || (row.state === "resolved" && viewerInvitee.role === "optional")) &&
        pollSlotsIncomplete,
      canManageAttendees:
        row.state === "resolved" &&
        (row.proposalType === "sleeping"
          ? canManageSleepingAttendees(isProposer, isAdmin)
          : isProposer || isAdmin || isInvitee),
      canComment:
        row.state !== "draft" &&
        row.state !== "archived" &&
        viewerCanSeeProposalWithSleepingGate(session.user.id, isAdmin, row.proposerId, inviteeUserIds, {
          proposalType: row.proposalType,
          state: row.state,
          adminCanSeeUninvolved,
        }),
      canCancel: canManage && (row.state === "proposed" || row.state === "resolved"),
      canAdminDeleteProposal: isAdmin && row.state !== "resolved",
      canRedraft: isProposer && row.state === "resolved",
      canReschedule:
        isAdmin &&
        row.state === "proposed" &&
        !row.isBatchSleeping,
      canAddBookedAttendee:
        row.state === "resolved" &&
        (row.proposalType === "sleeping"
          ? canManageSleepingAttendees(isProposer, isAdmin)
          : isProposer || isAdmin || isInvitee) &&
        bookingsEnabled(networkSettings?.schedulingPosting ?? "proposals_only"),
      canPostToFeed:
        row.state === "resolved" &&
        (isProposer || isAdmin) &&
        networkSettings?.feedEnabled !== false &&
        !row.postToFeed,
      canRevokeAcceptance:
        viewerInvitee?.role === "required" &&
        row.state === "resolved" &&
        !row.atRisk &&
        Boolean(
          viewerInvitee?.voteStatus &&
            APPROVING_VOTES.includes(viewerInvitee.voteStatus as InviteeVoteStatus),
        ),
      viewerVoteStatus: viewerInvitee?.voteStatus ?? null,
      viewerSlotVotes,
      hasOverlapWarning,
      canAcknowledgeOverlap: hasOverlapWarning,
      optionalRsvpPending,
      displayState,
      reminderOffsetMinutes: row.reminderOffsetMinutes ?? null,
      eventIconKey: row.proposalType !== "event" ? null : row.eventIconKey ?? null,
      scheduleColor: row.proposalType !== "event" ? null : row.scheduleColor ?? null,
      postToFeed: Boolean(row.postToFeed),
      postingKind: row.postingKind === "booking" ? "booking" : "proposal",
      onBehalfOfUserId: row.onBehalfOfUserId ?? null,
      tentative: Boolean(row.tentative),
      canRename: canRenameOrTentative,
      canToggleTentative: canRenameOrTentative,
      pendingIcsId: (
        await latestIcsPendingIdsByProposal(db, session.user.id, [row.id])
      ).get(row.id) ?? null,
    },
  };
}
