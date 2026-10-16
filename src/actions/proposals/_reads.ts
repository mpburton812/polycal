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

import { enrichPlaceOptionsWithMembers, mapPlaceOption } from "./_helpers";
import { assertLocationAllowed, createRecurringChildProposals, deleteRecurringChildProposals, loadAllowedProxyUserIds, replaceInvitees, replaceTimeSlots, validateComposerPosting } from "./_shared";

export async function listAcceptedSleepingPartnerIdsAction(
  forUserId?: string,
): Promise<string[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];
  const db = getDb();
  const targetId = forUserId?.trim() || session.user.id;
  if (targetId !== session.user.id) {
    const networkId = session.user.activeNetworkId;
    if (!networkId) return [];
    const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
    if (!isAdmin) {
      const settings = await loadNetworkSettings(networkId, db);
      if (!settings?.proxySchedulingEnabled) return [];
      const allowed = await loadAllowedProxyUserIds(
        db,
        session.user.id,
        networkId,
        settings.proxySchedulingScope ?? "sleeping_partners",
      );
      if (!allowed.has(targetId)) return [];
    }
  }
  return [...(await loadAcceptedSleepingPartnerIds(db, targetId))];
}

/**
 * Interaction frequency/recency for composer Who-chip sort (PC-435).
 */
export async function listComposerPeopleRankAction(): Promise<
  Array<{ userId: string; inviteCount: number; lastAt: string | null }>
> {
  await ensureDbReady();
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) return [];
  const db = getDb();
  const networkId = networkSession.user.activeNetworkId;
  const viewerId = networkSession.user.id;
  const asProposer = await db
    .select({
      userId: proposalInvitees.userId,
      createdAt: proposalInvitees.createdAt,
    })
    .from(proposalInvitees)
    .innerJoin(proposals, eq(proposalInvitees.proposalId, proposals.id))
    .where(
      and(
        eq(proposals.networkId, networkId),
        eq(proposals.proposerId, viewerId),
        ne(proposalInvitees.userId, viewerId),
      ),
    );
  const asInvitee = await db
    .select({
      proposerId: proposals.proposerId,
      createdAt: proposalInvitees.createdAt,
    })
    .from(proposalInvitees)
    .innerJoin(proposals, eq(proposalInvitees.proposalId, proposals.id))
    .where(
      and(
        eq(proposals.networkId, networkId),
        eq(proposalInvitees.userId, viewerId),
        ne(proposals.proposerId, viewerId),
      ),
    );
  const { mergeViewerInviteRankRows } = await import("@/lib/proposals/composer-people-rank");
  return mergeViewerInviteRankRows(asProposer, asInvitee);
}

/**
 * Places available at invitee residences plus the proposer's network (sleeping location picker).
 */
export async function listSleepingLocationOptionsAction(
  inviteeUserIds: string[],
): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) return [];

  const db = getDb();
  const networkId = networkSession.user.activeNetworkId;
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(networkSession.user));
  const userIds = [networkSession.user.id, ...inviteeUserIds];
  const eligibleIds = isAdmin
    ? null
    : await loadEligibleLocationIdsForUsers(db, userIds, networkId);
  if (!isAdmin && eligibleIds && eligibleIds.length === 0) return [];

  const placeRows = await listNetworkPickerPlaces(db, {
    networkId,
    viewerId: networkSession.user.id,
    restrictToLocationIds: eligibleIds,
  });
  return placeRows.map(mapPlaceOption);
}

/**
 * Places the current user may attach to a proposal draft (direct + sleeping network residency).
 */
export async function listProposalPlaceOptionsAction(): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) return [];

  const db = getDb();
  const networkId = networkSession.user.activeNetworkId;
  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(networkSession.user));
  const eligibleIds = isAdmin
    ? null
    : await loadEligibleLocationIdsForUser(db, networkSession.user.id, networkId);
  if (!isAdmin && eligibleIds && eligibleIds.length === 0) return [];

  const placeRows = await listNetworkPickerPlaces(db, {
    networkId,
    viewerId: networkSession.user.id,
    restrictToLocationIds: eligibleIds,
  });
  return enrichPlaceOptionsWithMembers(db, placeRows.map(mapPlaceOption));
}

/**
 * Detects schedule overlaps for proposer and invitees before submit (PC-40).
 */
export async function checkProposalConflictsAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; warnings: ProposalConflictWarning[] }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required.", warnings: [] };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal || proposal.proposerId !== session.user.id) {
    return { ok: false, message: "Proposal not found.", warnings: [] };
  }

  const warnings = await gatherProposalConflictWarnings(db, proposal, proposalId);

  return {
    ok: true,
    message: formatConflictMessage(warnings),
    warnings,
  };
}

/**
 * Admin conflict check for proposals owned by another user (PC-118).
 */
export async function adminCheckProposalConflictsAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; warnings: ProposalConflictWarning[] }> {
  const session = await auth();
  if (!session?.user || !(await userHasAdminAccess(adminAccessFromSessionUser(session.user)))) {
    return { ok: false, message: "Admin access required.", warnings: [] };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) {
    return { ok: false, message: "Proposal not found.", warnings: [] };
  }

  const warnings = await gatherProposalConflictWarnings(db, proposal, proposalId);

  return {
    ok: true,
    message: formatConflictMessage(warnings),
    warnings,
  };
}

/**
 * Resolves a proposal as an admin actor (PC-118 admin fast sleeping add).
 */
export async function adminForceResolveProposalAction(
  proposalId: string,
  actorUserId: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!proposal) {
    return { ok: false, message: "Proposal not found." };
  }

  // Await calendar sync so admin Fast sleeping does not rely solely on after() (PC-347).
  await resolveProposal(db, proposal, actorUserId, { awaitCalendarSync: true });

  return { ok: true, message: "Proposal resolved." };
}

// Resolved-proposal lifecycle actions (cancel/redraft/reschedule/attendees/nudge)
// and proposal comment actions live in ./lifecycle and ./comments (PC-329 carve).
