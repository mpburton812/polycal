/**
 * Proposal resolution engine (PC-328): poll tallying, resolve/revert
 * transitions, and per-slot aggregate sync.
 *
 * Carved out of `src/actions/proposals/_core.ts` (Epic 4 core carve) with no
 * behavior change — the scheduling math, poll matrix rules (PC-40), residency
 * side-effects (PC-56/PC-190), and notification copy (PC-49/PC-278/PC-322) are
 * byte-for-byte the same. On-resolve collision handling is delegated to
 * {@link autoDeclineCollidingProposals} in the sibling conflicts module.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import {
  locations,
  proposalInvitees,
  proposalSlotVotes,
  proposalTimeSlots,
  proposals,
  users,
  type InviteeVoteStatus,
  type ProposalState,
} from "@/lib/db/schema";
import { APPROVING_SLOT_VOTES, APPROVING_VOTES } from "@/lib/proposals/constants";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { resetInviteeVotes } from "@/lib/proposals/services/votes";
import { notifyProposalParticipants } from "@/lib/proposals/services/notify-participants";
import { enterAtRiskProposedState } from "@/lib/proposals/services/at-risk";
import {
  getProposalSpecialKind,
  isNonScheduleProposal,
  parseResidencyProposalMeta,
} from "@/lib/proposals/special-proposals";
import {
  applyResidencyProposalResolution,
  cleanupResidencyProposalLinkage,
} from "@/actions/residency-proposals";
import { sleepingScheduleFromSlotRows } from "@/lib/proposals/sleeping-schedule";
import {
  parseBatchEntriesJson,
  unionBatchInvitees,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping";
import { formatSleepingDisplayTitle } from "@/lib/proposals/sleeping-display";
import {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";
import { autoDeclineCollidingProposals } from "@/lib/proposals/services/conflicts";

/** Builds auto-generated sleeping proposal title (PC-66). */
export async function buildSleepingProposalTitle(
  db: ReturnType<typeof getDb>,
  input: {
    proposerName: string;
    intentionalSolo: boolean;
    locationId?: string | null;
    locationText?: string | null;
    locationName?: string | null;
    state: ProposalState | "draft";
    atRisk?: boolean;
    inviteeUserIds?: string[];
    batchEntries?: BatchSleepingEntry[];
  },
): Promise<string> {
  let inviteeNames: string[] = [];
  if (!input.intentionalSolo) {
    const inviteeIds =
      input.inviteeUserIds ??
      (input.batchEntries ? unionBatchInvitees(input.batchEntries).map((row) => row.userId) : []);
    if (inviteeIds.length > 0) {
      const rows = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, inviteeIds));
      inviteeNames = rows.map((row) => row.displayName);
    }
  }

  let locationName = input.locationName ?? input.locationText ?? null;
  if (!locationName && input.locationId) {
    const [place] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, input.locationId))
      .limit(1);
    locationName = place?.name ?? null;
  }

  if (!locationName && input.batchEntries?.length) {
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
  }

  return formatSleepingDisplayTitle({
    proposerName: input.proposerName,
    inviteeNames,
    intentionalSolo: input.intentionalSolo,
    locationName,
    state: input.state,
    atRisk: input.atRisk,
  });
}

/** Counts slots where every required invitee voted accept/abstain/sub-optimal (PC-40). */
export function countMutuallyAgreeableSlots(
  slotIds: string[],
  requiredUserIds: string[],
  slotVotes: { timeSlotId: string; userId: string; voteStatus: InviteeVoteStatus }[],
): number {
  if (requiredUserIds.length === 0 || slotIds.length === 0) return 0;
  let agreeable = 0;
  for (const slotId of slotIds) {
    const unanimous = requiredUserIds.every((userId) => {
      const vote = slotVotes.find((v) => v.timeSlotId === slotId && v.userId === userId);
      return vote !== undefined && APPROVING_SLOT_VOTES.includes(vote.voteStatus);
    });
    if (unanimous) agreeable += 1;
  }
  return agreeable;
}

/** True when a required invitee answered every poll slot. */
export function requiredCompletedPollMatrix(
  slotIds: string[],
  userId: string,
  slotVotes: { timeSlotId: string; userId: string; voteStatus: InviteeVoteStatus }[],
): boolean {
  if (slotIds.length === 0) return false;
  return slotIds.every((slotId) => {
    const vote = slotVotes.find((v) => v.timeSlotId === slotId && v.userId === userId);
    return vote !== undefined && vote.voteStatus !== "not_seen";
  });
}

/** Picks the poll slot with the highest accept score; ties break on earliest start. */
export function pickWinningSlot(
  slots: { id: string; startAt: string; endAt: string | null }[],
  votes: { timeSlotId: string; voteStatus: InviteeVoteStatus }[],
): string | null {
  if (slots.length === 0) return null;
  const scores = new Map<string, number>();
  for (const slot of slots) scores.set(slot.id, 0);

  for (const vote of votes) {
    if (vote.voteStatus === "accept") {
      scores.set(vote.timeSlotId, (scores.get(vote.timeSlotId) ?? 0) + 2);
    } else if (vote.voteStatus === "accept_suboptimal") {
      scores.set(vote.timeSlotId, (scores.get(vote.timeSlotId) ?? 0) + 1);
    }
  }

  const maxScore = Math.max(...scores.values());
  const tied = slots.filter((slot) => (scores.get(slot.id) ?? 0) === maxScore);
  tied.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return tied[0]?.id ?? slots[0].id;
}

/** Derives aggregate invitee vote from per-slot matrix once every slot is answered. */
export function aggregateVoteFromSlotVotes(
  votes: InviteeVoteStatus[],
): InviteeVoteStatus | null {
  if (votes.length === 0 || votes.some((v) => v === "not_seen")) return null;
  if (votes.every((v) => v === "decline")) return "decline";
  if (votes.some((v) => v === "accept")) return "accept";
  if (votes.some((v) => v === "accept_suboptimal")) return "accept_suboptimal";
  return "abstain";
}

/** Derives the resolved schedule from the earliest slot for non-sleeping kinds. */
export function scheduleFromSlots(
  slots: { startAt: string; endAt: string | null }[],
): { start: string | null; end: string | null } {
  if (slots.length === 0) return { start: null, end: null };
  const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { start: sorted[0].startAt, end: sorted[0].endAt };
}

/**
 * Moves a proposed item back to drafts after a required decline (PC-40).
 */
export async function revertProposalToDraft(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  actorUserId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();
  const noteLine = `Returned to drafts: ${reason}.`;

  await db
    .update(proposals)
    .set({
      state: "draft",
      atRisk: false,
      notes: proposal.notes?.trim() ? `${proposal.notes.trim()}\n${noteLine}` : noteLine,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  await resetInviteeVotes(db, proposal.id);
  await logProposalTransition(db, proposal.id, actorUserId, "proposal.reverted_to_draft", reason);

  if (parseResidencyProposalMeta(proposal.description)) {
    await cleanupResidencyProposalLinkage(db, proposal, true);
    await logUserActivity(
      actorUserId,
      "places.decline_residency",
      JSON.stringify({ proposalId: proposal.id, reason }),
    );
    revalidatePath("/people-places");
  }

  await dismissAllNotificationsForProposal(proposal.id);

  await notifyProposalParticipants(db, {
    proposalId: proposal.id,
    proposerId: proposal.proposerId,
    notificationType: "proposal_reverted_to_draft",
    message: formatDraftReturnNotification(proposal.title, reason),
    metadata: { reason, proposalType: proposal.proposalType },
  });
}

/**
 * Resolves a proposal when all required invitees have approved (PC-40).
 * Poll proposals pick the winning time slot from per-slot vote tallies.
 * Pass `awaitCalendarSync` for admin Fast sleeping so Google/ICS push completes
 * before the admin action returns (PC-347).
 */
export async function resolveProposal(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  actorUserId: string,
  options?: { awaitCalendarSync?: boolean },
): Promise<void> {
  const slots = await db
    .select({
      id: proposalTimeSlots.id,
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposal.id))
    .orderBy(asc(proposalTimeSlots.sortOrder));

  let winningSlotId: string | null = null;
  let scheduleStart: string | null = null;
  let scheduleEnd: string | null = null;

  if (proposal.isPoll && slots.length > 1) {
    const slotVoteRows = await db
      .select({
        timeSlotId: proposalSlotVotes.timeSlotId,
        voteStatus: proposalSlotVotes.voteStatus,
      })
      .from(proposalSlotVotes)
      .where(eq(proposalSlotVotes.proposalId, proposal.id));

    winningSlotId = pickWinningSlot(slots, slotVoteRows);
    const winner = slots.find((s) => s.id === winningSlotId);
    scheduleStart = winner?.startAt ?? null;
    scheduleEnd = winner?.endAt ?? null;
  } else {
    if (proposal.proposalType === "sleeping") {
      if (proposal.isBatchSleeping && slots.length > 0) {
        const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
        scheduleStart = sorted[0]?.startAt ?? null;
        // Last night start anchors archive/grace (scheduledEndAt null would use first night only).
        scheduleEnd = sorted[sorted.length - 1]?.startAt ?? null;
        if (scheduleStart && scheduleEnd && scheduleStart === scheduleEnd) {
          scheduleEnd = null;
        }
      } else {
        const sleeping = sleepingScheduleFromSlotRows(slots);
        scheduleStart = sleeping.start;
        scheduleEnd = sleeping.end;
      }
    } else {
      const schedule = scheduleFromSlots(slots);
      scheduleStart = schedule.start;
      scheduleEnd = schedule.end;
    }
  }

  const now = new Date().toISOString();

  if (proposal.proposalType === "sleeping") {
    const [proposerRow] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, proposal.proposerId))
      .limit(1);
    const inviteeRows = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, proposal.id));
    const batchEntries = parseBatchEntriesJson(proposal.batchEntriesJson);
    const resolvedTitle = await buildSleepingProposalTitle(db, {
      proposerName: proposerRow?.displayName ?? "User",
      intentionalSolo: proposal.intentionalSolo,
      locationId: proposal.locationId,
      locationText: proposal.locationText,
      state: "resolved",
      atRisk: false,
      inviteeUserIds: inviteeRows.map((row) => row.userId),
      batchEntries: proposal.isBatchSleeping ? batchEntries : undefined,
    });
    await db
      .update(proposals)
      .set({
        state: "resolved",
        title: resolvedTitle,
        scheduledStartAt: scheduleStart,
        scheduledEndAt: scheduleEnd,
        winningSlotId,
        atRisk: false,
        atRiskExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));
    proposal.title = resolvedTitle;
  } else {
    await db
      .update(proposals)
      .set({
        state: "resolved",
        scheduledStartAt: scheduleStart,
        scheduledEndAt: scheduleEnd,
        winningSlotId,
        atRisk: false,
        atRiskExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));
  }

  await logProposalTransition(db, proposal.id, actorUserId, "proposal.resolved");

  const residencyMeta = parseResidencyProposalMeta(proposal.description);
  if (residencyMeta) {
    await applyResidencyProposalResolution(db, proposal, actorUserId);
  }

  const pollMatrix = proposal.isPoll && slots.length > 1;
  const specialKind = getProposalSpecialKind(proposal.description);
  // Optional invitees still owe an RSVP after required attendees resolve, so they
  // get an actionable variant (message + vote deep-link) while everyone else gets
  // the plain "approved and scheduled" copy — behavior identical to the prior loop
  // (PC-49 / PC-278 / PC-322).
  await notifyProposalParticipants(db, {
    proposalId: proposal.id,
    proposerId: proposal.proposerId,
    notificationType: "proposal_resolved",
    metadata: { proposalType: proposal.proposalType },
    message: ({ role, voteStatus }) => {
      const optionalStillVoting = role === "optional" && voteStatus === "not_seen";
      if (specialKind === "residency") {
        return `Residency proposal "${proposal.title}" was accepted.`;
      }
      if (optionalStillVoting) {
        return pollMatrix
          ? `Proposal "${proposal.title}" was approved by all required attendees and scheduled. Please complete your poll votes.`
          : `Proposal "${proposal.title}" was approved by all required attendees and scheduled. Please Accept or Decline.`;
      }
      return `Proposal "${proposal.title}" was approved and scheduled.`;
    },
    metadataFor: ({ role, voteStatus }) =>
      role === "optional" && voteStatus === "not_seen" ? { action: "vote" } : {},
  });

  if (!isNonScheduleProposal(proposal.description)) {
    await autoDeclineCollidingProposals(db, proposal, scheduleStart, scheduleEnd, actorUserId);
  }

  // External calendar sync (Option B) — after() on Vercel; awaited in E2E / admin Fast add.
  const { scheduleCalendarSync } = await import("@/lib/calendar/sync");
  await scheduleCalendarSync(proposal.id, "upsert", {
    awaitSync: options?.awaitCalendarSync === true,
  });
}

/**
 * Checks whether a proposed item should resolve or revert after a vote (PC-40).
 * Poll proposals wait for all required matrix votes before evaluating mutual slots.
 */
export async function evaluateProposalAfterVote(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  actorUserId: string,
): Promise<void> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (
    !proposal ||
    (proposal.state !== "proposed" &&
      !(proposal.state === "resolved" && proposal.atRisk) &&
      !(proposal.state === "resolved" && !proposal.atRisk))
  ) {
    return;
  }

  const invitees = await db
    .select()
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const required = invitees.filter((row) => row.role === "required");

  if (proposal.state === "resolved" && !proposal.atRisk) {
    const declinedRequired = required.find((row) => row.voteStatus === "decline");
    if (declinedRequired) {
      await revertProposalToDraft(
        db,
        proposal,
        actorUserId,
        "A required invitee declined.",
      );
      return;
    }

    const pendingRequired = required.filter((row) => row.voteStatus === "not_seen");
    if (pendingRequired.length > 0) return;
    return;
  }

  const slotRows = await db
    .select({ id: proposalTimeSlots.id })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));
  const isPollMatrix = proposal.isPoll && slotRows.length > 1;

  if (isPollMatrix) {
    const slotVoteRows = await db
      .select({
        timeSlotId: proposalSlotVotes.timeSlotId,
        userId: proposalSlotVotes.userId,
        voteStatus: proposalSlotVotes.voteStatus,
      })
      .from(proposalSlotVotes)
      .where(eq(proposalSlotVotes.proposalId, proposalId));

    const slotIds = slotRows.map((row) => row.id);
    const requiredIds = required.map((row) => row.userId);
    const allMatricesComplete = requiredIds.every((userId) =>
      requiredCompletedPollMatrix(slotIds, userId, slotVoteRows),
    );

    if (!allMatricesComplete) return;

    const agreeableSlots = countMutuallyAgreeableSlots(slotIds, requiredIds, slotVoteRows);
    if (agreeableSlots === 0) {
      await revertProposalToDraft(
        db,
        proposal,
        actorUserId,
        "No mutually agreeable poll slots among required invitees.",
      );
      return;
    }

    const pendingRequired = required.filter((row) => row.voteStatus === "not_seen");
    if (pendingRequired.length > 0) return;

    if (required.length === 0 || required.every((row) => APPROVING_VOTES.includes(row.voteStatus))) {
      await resolveProposal(db, proposal, actorUserId);
    }
    return;
  }

  const declinedRequired = required.find((row) => row.voteStatus === "decline");
  if (declinedRequired) {
    if (proposal.state === "resolved") {
      await enterAtRiskProposedState(db, proposal, actorUserId, "A required invitee declined.");
    } else {
      await revertProposalToDraft(db, proposal, actorUserId, "A required invitee declined.");
    }
    return;
  }

  const pendingRequired = required.filter((row) => row.voteStatus === "not_seen");
  if (pendingRequired.length > 0) return;

  if (required.length === 0 || required.every((row) => APPROVING_VOTES.includes(row.voteStatus))) {
    await resolveProposal(db, proposal, actorUserId);
  }
}

/**
 * Syncs aggregate invitee vote from completed per-slot poll matrix (PC-40).
 */
export async function syncInviteeAggregateFromSlotVotes(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  userId: string,
): Promise<void> {
  const slots = await db
    .select({ id: proposalTimeSlots.id })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));

  if (slots.length === 0) return;

  const votes = await db
    .select({ voteStatus: proposalSlotVotes.voteStatus })
    .from(proposalSlotVotes)
    .where(
      and(eq(proposalSlotVotes.proposalId, proposalId), eq(proposalSlotVotes.userId, userId)),
    );

  if (votes.length < slots.length) return;

  const aggregate = aggregateVoteFromSlotVotes(votes.map((v) => v.voteStatus));
  if (!aggregate) return;

  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ voteStatus: aggregate, respondedAt: now })
    .where(
      and(eq(proposalInvitees.proposalId, proposalId), eq(proposalInvitees.userId, userId)),
    );
}
