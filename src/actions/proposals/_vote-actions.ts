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

const overlapResponseSchema = z.object({
  proposalId: z.string().min(1),
  response: z.enum(["acknowledge", "decline"]),
});

/**
 * Acknowledges or declines an in-flight calendar overlap after voting (PC-46).
 */
export async function acknowledgeProposalOverlapAction(
  input: z.infer<typeof overlapResponseSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = overlapResponseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid overlap response." };
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);
  if (!proposal || proposal.state === "draft" || proposal.state === "archived") {
    return { ok: false, message: "Proposal not found." };
  }

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, parsed.data.proposalId),
        eq(proposalInvitees.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!invitee || invitee.voteStatus === "not_seen") {
    return { ok: false, message: "You have not voted on this proposal yet." };
  }

  const hasOverlap = await detectViewerOverlapWarning(
    db,
    proposal.id,
    session.user.id,
    invitee.voteStatus,
    invitee.overlapAcknowledgedAt,
    proposal.scheduledStartAt,
    proposal.scheduledEndAt,
    proposal.proposalType,
    proposal.isAllDay,
  );

  if (!hasOverlap) {
    return { ok: false, message: "No active overlap warning for this proposal." };
  }

  const now = new Date().toISOString();
  const actor = actorNotifyFields(session.user);

  if (parsed.data.response === "acknowledge") {
    await db
      .update(proposalInvitees)
      .set({ overlapAcknowledgedAt: now })
      .where(eq(proposalInvitees.id, invitee.id));

    await logProposalTransition(
      db,
      proposal.id,
      session.user.id,
      "proposal.overlap_acknowledged",
      "Viewer acknowledged schedule conflict after voting.",
    );

    revalidatePath("/proposals");
    revalidatePath("/schedule");
    return { ok: true, message: "Overlap acknowledged. Your vote stands." };
  }

  await db
    .update(proposalInvitees)
    .set({
      voteStatus: "decline",
      respondedAt: now,
      overlapAcknowledgedAt: null,
    })
    .where(eq(proposalInvitees.id, invitee.id));

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    "proposal.overlap_declined",
    "Viewer declined after schedule conflict was detected.",
  );

  await notifyUser(
    proposal.proposerId,
    "proposal_vote_cast",
    `${actor.actorDisplayName} changed their vote to decline on "${proposal.title}" after a schedule conflict.`,
    {
      proposalId: proposal.id,
      voterId: session.user.id,
      vote: "decline",
      proposalType: proposal.proposalType,
      ...actor,
    },
  );

  if (invitee.role === "required") {
    if (proposal.state === "proposed" || (proposal.state === "resolved" && proposal.atRisk)) {
      await evaluateProposalAfterVote(db, proposal.id, session.user.id);
    } else if (proposal.state === "resolved") {
      await enterAtRiskProposedState(
        db,
        proposal,
        session.user.id,
        "A required invitee declined after a schedule conflict.",
      );
    }
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Vote changed to decline due to schedule conflict." };
}

/**
 * Records an invitee vote (or a proxy vote for a passive invitee the actor added) (PC-40 / PC-246).
 */
export async function castProposalVoteAction(
  input: z.infer<typeof voteSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid vote." };
  }

  await ensureDbReady();
  const db = getDb();
  await runProposalEnforcement(db);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);
  if (!proposal) {
    return { ok: false, message: "Proposal is not open for voting." };
  }

  const isAdmin = await userHasAdminAccess(adminAccessFromSessionUser(session.user));
  const targetUserId = parsed.data.onBehalfOfUserId ?? session.user.id;
  const isProxy = Boolean(parsed.data.onBehalfOfUserId);

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, parsed.data.proposalId),
        eq(proposalInvitees.userId, targetUserId),
      ),
    )
    .limit(1);

  if (!invitee) {
    return {
      ok: false,
      message: isProxy
        ? "That person is not an invitee on this proposal."
        : "You are not an invitee on this proposal.",
    };
  }

  let proxyDisplayName: string | null = null;
  if (isProxy) {
    const proxyCheck = await canProxyVoteForPassiveInvitee(db, {
      inviteeUserId: targetUserId,
      actorUserId: session.user.id,
      isAdmin,
      proposerId: proposal.proposerId,
    });
    if (!proxyCheck.ok) {
      return { ok: false, message: proxyCheck.message };
    }
    proxyDisplayName = proxyCheck.displayName;
  }

  const isOptionalResolvedVote = proposal.state === "resolved" && invitee.role === "optional";
  const isAtRiskRequiredVote =
    proposal.state === "resolved" && proposal.atRisk && invitee.role === "required";
  const isPendingRequiredOnResolved =
    proposal.state === "resolved" && !proposal.atRisk && invitee.role === "required";
  const isProposedVote = proposal.state === "proposed";

  const alreadyVoted = invitee.voteStatus !== "not_seen";
  if (alreadyVoted && !isProxy) {
    return { ok: false, message: "You have already voted on this proposal." };
  }

  if (
    !isOptionalResolvedVote &&
    !isAtRiskRequiredVote &&
    !isPendingRequiredOnResolved &&
    !isProposedVote
  ) {
    return { ok: false, message: "Proposal is not open for voting." };
  }

  const slotCount = (
    await db
      .select({ id: proposalTimeSlots.id })
      .from(proposalTimeSlots)
      .where(eq(proposalTimeSlots.proposalId, proposal.id))
  ).length;

  if (proposal.isPoll && slotCount > 1) {
    return { ok: false, message: "Use per-slot voting for poll proposals." };
  }

  const now = new Date().toISOString();
  const actor = actorNotifyFields(session.user);
  await db
    .update(proposalInvitees)
    .set({
      voteStatus: parsed.data.vote,
      respondedAt: now,
    })
    .where(eq(proposalInvitees.id, invitee.id));

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    isProxy ? "proposal.passive_proxy_vote" : "proposal.vote_cast",
    JSON.stringify({
      vote: parsed.data.vote,
      role: invitee.role,
      ...(isProxy
        ? {
            onBehalfOfUserId: targetUserId,
            displayName: proxyDisplayName,
            message: `Voted ${parsed.data.vote} for ${proxyDisplayName}`,
          }
        : {}),
    }),
  );

  await notifyUser(proposal.proposerId, "proposal_vote_cast", `${actor.actorDisplayName} cast a vote on "${proposal.title}".`, {
    proposalId: proposal.id,
    voterId: session.user.id,
    vote: parsed.data.vote,
    proposalType: proposal.proposalType,
    ...(isProxy ? { onBehalfOfUserId: targetUserId } : {}),
    ...actor,
  });

  if (invitee.role === "required") {
    await evaluateProposalAfterVote(db, proposal.id, session.user.id);
  }

  await dismissNotificationsForProposal(session.user.id, proposal.id);

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return {
    ok: true,
    message: isProxy ? `Vote recorded for ${proxyDisplayName}.` : "Vote recorded.",
  };
}

/**
 * Records a per-slot poll matrix vote and syncs aggregate status (PC-40).
 */
export async function castSlotVoteAction(
  input: z.infer<typeof slotVoteSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = slotVoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid vote." };
  }

  await ensureDbReady();
  const db = getDb();

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || !proposal.isPoll) {
    return { ok: false, message: "Not a poll proposal." };
  }

  const [invitee] = await db
    .select()
    .from(proposalInvitees)
    .where(
      and(
        eq(proposalInvitees.proposalId, parsed.data.proposalId),
        eq(proposalInvitees.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!invitee) {
    return { ok: false, message: "You are not an invitee on this proposal." };
  }

  const canVoteNow =
    proposal.state === "proposed" ||
    (proposal.state === "resolved" && invitee.role === "optional");

  if (!canVoteNow) {
    return { ok: false, message: "Poll voting is closed." };
  }

  const [slot] = await db
    .select({ id: proposalTimeSlots.id })
    .from(proposalTimeSlots)
    .where(
      and(
        eq(proposalTimeSlots.id, parsed.data.timeSlotId),
        eq(proposalTimeSlots.proposalId, parsed.data.proposalId),
      ),
    )
    .limit(1);

  if (!slot) {
    return { ok: false, message: "Time slot not found." };
  }

  const now = new Date().toISOString();
  const [existing] = await db
    .select({ id: proposalSlotVotes.id })
    .from(proposalSlotVotes)
    .where(
      and(
        eq(proposalSlotVotes.timeSlotId, parsed.data.timeSlotId),
        eq(proposalSlotVotes.userId, session.user.id),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(proposalSlotVotes)
      .set({ voteStatus: parsed.data.vote, respondedAt: now })
      .where(eq(proposalSlotVotes.id, existing.id));
  } else {
    await db.insert(proposalSlotVotes).values({
      id: `psv-${randomUUID()}`,
      proposalId: parsed.data.proposalId,
      timeSlotId: parsed.data.timeSlotId,
      userId: session.user.id,
      voteStatus: parsed.data.vote,
      respondedAt: now,
      createdAt: now,
    });
  }

  await logProposalTransition(
    db,
    proposal.id,
    session.user.id,
    "proposal.slot_vote_cast",
    JSON.stringify({ timeSlotId: parsed.data.timeSlotId, vote: parsed.data.vote }),
  );

  await syncInviteeAggregateFromSlotVotes(db, proposal.id, session.user.id);

  if (invitee.role === "required" && proposal.state === "proposed") {
    await evaluateProposalAfterVote(db, proposal.id, session.user.id);
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Slot vote recorded." };
}
