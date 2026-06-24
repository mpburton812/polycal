"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locationResidents,
  locations,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  users,
  type EventPrivacyLevel,
  type InviteeRole,
  type InviteeVoteStatus,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import type { UserRole } from "@/types/user";

const inviteeInputSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["required", "optional"]),
});

const timeSlotInputSchema = z.object({
  startAt: z.string().min(1),
  endAt: z.string().optional(),
  label: z.string().trim().max(120).optional(),
});

const draftProposalSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().min(1, "Description is required.").max(2000),
  proposalType: z.enum(["event", "sleeping"]),
  locationId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  intentionalSolo: z.boolean().optional(),
  isPoll: z.boolean().optional(),
  eventPrivacy: z.enum(["open", "private", "super_private"]).optional(),
  invitees: z.array(inviteeInputSchema).optional(),
  timeSlots: z.array(timeSlotInputSchema).max(10).optional(),
});

const commentSchema = z.object({
  proposalId: z.string().min(1),
  body: z.string().trim().min(1, "Comment cannot be empty.").max(2000),
});

const voteSchema = z.object({
  proposalId: z.string().min(1),
  vote: z.enum(["accept", "abstain", "decline", "accept_suboptimal"]),
});

const slotVoteSchema = z.object({
  proposalId: z.string().min(1),
  timeSlotId: z.string().min(1),
  vote: z.enum(["accept", "abstain", "decline", "accept_suboptimal"]),
});

const batchSleepingSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  locationId: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  intentionalSolo: z.boolean().optional(),
  invitees: z.array(inviteeInputSchema).optional(),
  rangeStart: z.string().min(1),
  rangeEnd: z.string().min(1),
  nightsPattern: z.enum(["every", "weekdays", "weekends"]),
});

const attendeeUpdateSchema = z.object({
  proposalId: z.string().min(1),
  addOptional: z.array(z.string().min(1)).optional(),
  removeUserIds: z.array(z.string().min(1)).optional(),
});

const AT_RISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProposalCard {
  id: string;
  title: string;
  description: string | null;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  proposerName: string;
  locationName: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  atRisk: boolean;
  isPoll: boolean;
  /** True when the viewer must act on a proposed item. */
  needsViewerAction: boolean;
  inviteeCount: number;
  respondedCount: number;
  isPastSchedule: boolean;
}

export interface ProposalBoard {
  draft: ProposalCard[];
  proposed: ProposalCard[];
  resolved: ProposalCard[];
  archived: ProposalCard[];
}

export interface ProposalPlaceOption {
  id: string;
  name: string;
}

export interface ProposalInviteeView {
  userId: string;
  displayName: string;
  role: InviteeRole;
  voteStatus: InviteeVoteStatus;
}

export interface ProposalTimeSlotView {
  id: string;
  startAt: string;
  endAt: string | null;
  label: string | null;
}

export interface ProposalSlotVoteView {
  timeSlotId: string;
  userId: string;
  displayName: string;
  voteStatus: InviteeVoteStatus;
}

export interface ProposalConflictWarning {
  userId: string;
  displayName: string;
  conflictingTitle: string;
  conflictingState: ProposalState;
  overlapStart: string;
  overlapEnd: string | null;
}

export interface ProposalDetail {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  proposalType: ProposalType;
  state: ProposalState;
  proposerId: string;
  proposerName: string;
  locationId: string | null;
  locationName: string | null;
  intentionalSolo: boolean;
  isPoll: boolean;
  eventPrivacy: EventPrivacyLevel;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  atRisk: boolean;
  invitees: ProposalInviteeView[];
  timeSlots: ProposalTimeSlotView[];
  slotVotes: ProposalSlotVoteView[];
  winningSlotId: string | null;
  comments: ProposalCommentView[];
  stateLog: ProposalStateLogView[];
  canEdit: boolean;
  canVote: boolean;
  canVoteSlots: boolean;
  canManageAttendees: boolean;
  canComment: boolean;
  canCancel: boolean;
  canRedraft: boolean;
  viewerVoteStatus: InviteeVoteStatus | null;
  viewerSlotVotes: Record<string, InviteeVoteStatus>;
}

export interface ProposalCommentView {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ProposalStateLogView {
  action: string;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}

const APPROVING_VOTES: InviteeVoteStatus[] = ["accept", "abstain", "accept_suboptimal"];

/** Returns true when two ISO intervals overlap (open end uses start as instant). */
function intervalsOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aEndMs = aEnd ? new Date(aEnd).getTime() : new Date(aStart).getTime();
  const bEndMs = bEnd ? new Date(bEnd).getTime() : new Date(bStart).getTime();
  const aStartMs = new Date(aStart).getTime();
  const bStartMs = new Date(bStart).getTime();
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

/**
 * Archives at-risk drafts whose TTL expired without resubmission (PC-40).
 */
async function expireAtRiskProposals(db: ReturnType<typeof getDb>): Promise<void> {
  const now = new Date().toISOString();
  const expired = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, "draft"), eq(proposals.atRisk, true)));

  for (const proposal of expired) {
    if (!proposal.atRiskExpiresAt || proposal.atRiskExpiresAt > now) continue;
    await db
      .update(proposals)
      .set({
        state: "archived",
        atRisk: false,
        atRiskExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));
    await logProposalTransition(
      db,
      proposal.id,
      null,
      "proposal.at_risk_expired",
      "At-risk TTL elapsed without resubmission.",
    );
  }
}

/** Picks the poll slot with the highest accept score; ties break on earliest start. */
function pickWinningSlot(
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
function aggregateVoteFromSlotVotes(
  votes: InviteeVoteStatus[],
): InviteeVoteStatus | null {
  if (votes.length === 0 || votes.some((v) => v === "not_seen")) return null;
  if (votes.every((v) => v === "decline")) return "decline";
  if (votes.some((v) => v === "accept")) return "accept";
  if (votes.some((v) => v === "accept_suboptimal")) return "accept_suboptimal";
  return "abstain";
}

/**
 * Appends an immutable state transition entry for proposal audit (PC-40).
 */
async function logProposalTransition(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  actorUserId: string | null,
  action: string,
  details?: string,
): Promise<void> {
  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

/** Whether the viewer may see a proposal in a non-draft column. */
function viewerCanSeeProposal(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
): boolean {
  if (isAdmin) return true;
  if (proposerId === viewerId) return true;
  return inviteeUserIds.includes(viewerId);
}

/** Notifies proposer and all invitees on a proposal (PC-40). */
async function notifyProposalStakeholders(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  notificationType: string,
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposal.id));

  const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
  for (const userId of notifyIds) {
    await notifyUser(userId, notificationType, message, {
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      ...extra,
    });
  }
}

/**
 * Lists Kanban columns scoped to the signed-in user (PC-40).
 */
export async function listProposalBoardAction(): Promise<ProposalBoard> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) {
    return { draft: [], proposed: [], resolved: [], archived: [] };
  }

  const db = getDb();
  await expireAtRiskProposals(db);
  const viewerId = session.user.id;
  const isAdmin = await userHasAdminAccess(session.user.role);
  const nowIso = new Date().toISOString();

  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      description: proposals.description,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposerName: users.displayName,
      locationName: locations.name,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      isPoll: proposals.isPoll,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .orderBy(asc(proposals.updatedAt));

  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees);

  const inviteesByProposal = new Map<string, typeof inviteeRows>();
  for (const row of inviteeRows) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row);
    inviteesByProposal.set(row.proposalId, list);
  }

  const empty: ProposalBoard = { draft: [], proposed: [], resolved: [], archived: [] };

  for (const row of rows) {
    const invitees = inviteesByProposal.get(row.id) ?? [];
    const inviteeUserIds = invitees.map((invitee) => invitee.userId);

    if (row.state === "draft") {
      if (row.proposerId !== viewerId) continue;
    } else if (!viewerCanSeeProposal(viewerId, isAdmin, row.proposerId, inviteeUserIds)) {
      continue;
    }

    const viewerInvitee = invitees.find((invitee) => invitee.userId === viewerId);
    const respondedCount = invitees.filter((inv) => inv.voteStatus !== "not_seen").length;
    const needsViewerAction =
      row.state === "proposed" &&
      viewerInvitee !== undefined &&
      viewerInvitee.voteStatus === "not_seen";

    const scheduleEnd = row.scheduledEndAt ?? row.scheduledStartAt;
    const isPastSchedule = Boolean(scheduleEnd && scheduleEnd < nowIso);

    const card: ProposalCard = {
      id: row.id,
      title: row.title,
      description: row.description,
      proposalType: row.proposalType,
      state: row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationName: row.locationName ?? null,
      scheduledStartAt: row.scheduledStartAt ?? null,
      scheduledEndAt: row.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      isPoll: row.isPoll,
      needsViewerAction,
      inviteeCount: invitees.length,
      respondedCount,
      isPastSchedule,
    };

    const column = row.state as keyof ProposalBoard;
    empty[column].push(card);
  }

  return empty;
}

/**
 * Places the current user may attach to a proposal draft (accepted residency).
 */
export async function listProposalPlaceOptionsAction(): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];

  const db = getDb();
  const isAdmin = await userHasAdminAccess(session.user.role);

  if (isAdmin) {
    const all = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .orderBy(asc(locations.name));
    return all;
  }

  const residentRows = await db
    .select({ locationId: locationResidents.locationId })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.userId, session.user.id),
        eq(locationResidents.status, "accepted"),
      ),
    );

  const locationIds = residentRows.map((row) => row.locationId);
  if (locationIds.length === 0) return [];

  const placeRows = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(inArray(locations.id, locationIds))
    .orderBy(asc(locations.name));

  return placeRows;
}

/**
 * Validates the viewer may use a location on a proposal.
 */
async function assertLocationAllowed(
  db: ReturnType<typeof getDb>,
  userId: string,
  role: string,
  locationId: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!locationId) return { ok: true };

  const [place] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!place) {
    return { ok: false, error: "Selected place was not found." };
  }

  if (await userHasAdminAccess(role as UserRole)) {
    return { ok: true };
  }

  const [resident] = await db
    .select({ id: locationResidents.id })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, locationId),
        eq(locationResidents.userId, userId),
        eq(locationResidents.status, "accepted"),
      ),
    )
    .limit(1);

  if (!resident) {
    return { ok: false, error: "You can only schedule at places you are associated with." };
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

async function replaceTimeSlots(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  slots: { startAt: string; endAt?: string; label?: string }[],
): Promise<void> {
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  const now = new Date().toISOString();

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId,
      startAt: slot.startAt,
      endAt: slot.endAt ?? null,
      label: slot.label ?? null,
      sortOrder: index,
      createdAt: now,
    });
  }
}

function scheduleFromSlots(
  slots: { startAt: string; endAt: string | null }[],
): { start: string | null; end: string | null } {
  if (slots.length === 0) return { start: null, end: null };
  const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { start: sorted[0].startAt, end: sorted[0].endAt };
}

async function resetInviteeVotes(db: ReturnType<typeof getDb>, proposalId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ voteStatus: "not_seen", respondedAt: null })
    .where(eq(proposalInvitees.proposalId, proposalId));
  await db.update(proposals).set({ updatedAt: now }).where(eq(proposals.id, proposalId));
}

/**
 * Moves a proposed item back to drafts after a required decline (PC-40).
 */
async function revertProposalToDraft(
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

  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposal.id));

  const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
  for (const userId of notifyIds) {
    await notifyUser(
      userId,
      "proposal_reverted_to_draft",
      `Proposal "${proposal.title}" was moved back to drafts.`,
      { proposalId: proposal.id, reason },
    );
  }
}

/**
 * Resolves a proposal when all required invitees have approved (PC-40).
 * Poll proposals pick the winning time slot from per-slot vote tallies.
 */
async function resolveProposal(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  actorUserId: string,
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
    const schedule = scheduleFromSlots(slots);
    scheduleStart = schedule.start;
    scheduleEnd = schedule.end;
    winningSlotId = slots.length === 1 ? slots[0].id : null;
  }

  const now = new Date().toISOString();

  await db
    .update(proposals)
    .set({
      state: "resolved",
      scheduledStartAt: scheduleStart,
      scheduledEndAt: scheduleEnd,
      winningSlotId,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  await logProposalTransition(db, proposal.id, actorUserId, "proposal.resolved");

  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposal.id));

  const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
  for (const userId of notifyIds) {
    await notifyUser(
      userId,
      "proposal_resolved",
      `Proposal "${proposal.title}" was approved and scheduled.`,
      { proposalId: proposal.id },
    );
  }
}

/**
 * Checks whether a proposed item should resolve or revert after a vote (PC-40).
 */
async function evaluateProposalAfterVote(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  actorUserId: string,
): Promise<void> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal || proposal.state !== "proposed") return;

  const invitees = await db
    .select()
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const required = invitees.filter((row) => row.role === "required");
  const declinedRequired = required.find((row) => row.voteStatus === "decline");
  if (declinedRequired) {
    await revertProposalToDraft(db, proposal, actorUserId, "A required invitee declined.");
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
async function syncInviteeAggregateFromSlotVotes(
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

  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt, endAt: proposalTimeSlots.endAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));

  const checkWindows =
    slots.length > 0
      ? slots.map((s) => ({ start: s.startAt, end: s.endAt }))
      : proposal.scheduledStartAt
        ? [{ start: proposal.scheduledStartAt, end: proposal.scheduledEndAt }]
        : [];

  if (checkWindows.length === 0) {
    return { ok: true, message: "No schedule to check.", warnings: [] };
  }

  const stakeholderIds = new Set([proposal.proposerId, ...invitees.map((i) => i.userId)]);
  const warnings: ProposalConflictWarning[] = [];

  const activeProposals = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      state: proposals.state,
      proposerId: proposals.proposerId,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
    })
    .from(proposals)
    .where(inArray(proposals.state, ["proposed", "resolved"]));

  const activeInvitees = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
    })
    .from(proposalInvitees);

  const inviteesByProposal = new Map<string, string[]>();
  for (const row of activeInvitees) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row.userId);
    inviteesByProposal.set(row.proposalId, list);
  }

  const userNames = await db.select({ id: users.id, displayName: users.displayName }).from(users);
  const nameById = new Map(userNames.map((u) => [u.id, u.displayName]));

  for (const other of activeProposals) {
    if (other.id === proposalId) continue;
    if (!other.scheduledStartAt) continue;

    const otherStakeholders = new Set([
      other.proposerId,
      ...(inviteesByProposal.get(other.id) ?? []),
    ]);
    const affected = [...stakeholderIds].filter((id) => otherStakeholders.has(id));
    if (affected.length === 0) continue;

    for (const window of checkWindows) {
      if (
        intervalsOverlap(
          window.start,
          window.end,
          other.scheduledStartAt,
          other.scheduledEndAt,
        )
      ) {
        for (const userId of affected) {
          warnings.push({
            userId,
            displayName: nameById.get(userId) ?? "Unknown",
            conflictingTitle: other.title,
            conflictingState: other.state as ProposalState,
            overlapStart: window.start,
            overlapEnd: window.end,
          });
        }
        break;
      }
    }
  }

  return {
    ok: true,
    message: warnings.length > 0 ? "Schedule conflicts detected." : "No conflicts.",
    warnings,
  };
}

/**
 * Creates a new draft proposal for the signed-in user (PC-40).
 */
export async function createDraftProposalAction(
  input: z.infer<typeof draftProposalSchema>,
): Promise<{ ok: boolean; message: string; proposalId?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = draftProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();

  const locationCheck = await assertLocationAllowed(
    db,
    session.user.id,
    session.user.role,
    parsed.data.locationId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);
  const isPoll = Boolean(parsed.data.isPoll) || (parsed.data.timeSlots?.length ?? 0) > 1;
  const eventPrivacy = parsed.data.eventPrivacy ?? "open";

  await db.insert(proposals).values({
    id: proposalId,
    title: parsed.data.title,
    description: parsed.data.description,
    proposalType: parsed.data.proposalType,
    state: "draft",
    proposerId: session.user.id,
    locationId: parsed.data.locationId ?? null,
    notes: parsed.data.notes ?? null,
    intentionalSolo,
    isPoll,
    eventPrivacy,
    createdAt: now,
    updatedAt: now,
  });

  if (parsed.data.invitees?.length) {
    await replaceInvitees(db, proposalId, session.user.id, parsed.data.invitees);
  }

  if (parsed.data.timeSlots) {
    await replaceTimeSlots(db, proposalId, parsed.data.timeSlots);
  }

  await logProposalTransition(db, proposalId, session.user.id, "draft.created");
  revalidatePath("/proposals");

  return { ok: true, message: "Draft saved.", proposalId };
}

/**
 * Updates an existing draft owned by the signed-in user (PC-40).
 */
export async function updateDraftProposalAction(
  input: z.infer<typeof draftProposalSchema> & { proposalId: string },
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = draftProposalSchema
    .extend({ proposalId: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || proposal.proposerId !== session.user.id || proposal.state !== "draft") {
    return { ok: false, message: "Draft not found." };
  }

  const locationCheck = await assertLocationAllowed(
    db,
    session.user.id,
    session.user.role,
    parsed.data.locationId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const now = new Date().toISOString();
  const isPoll =
    parsed.data.isPoll !== undefined
      ? parsed.data.isPoll
      : (parsed.data.timeSlots?.length ?? 0) > 1;
  await db
    .update(proposals)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      proposalType: parsed.data.proposalType,
      locationId: parsed.data.locationId ?? null,
      notes: parsed.data.notes ?? null,
      intentionalSolo: Boolean(parsed.data.intentionalSolo),
      isPoll: Boolean(isPoll),
      eventPrivacy: parsed.data.eventPrivacy ?? proposal.eventPrivacy,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  if (parsed.data.invitees) {
    await replaceInvitees(db, proposal.id, session.user.id, parsed.data.invitees);
  }

  if (parsed.data.timeSlots) {
    await replaceTimeSlots(db, proposal.id, parsed.data.timeSlots);
  }

  await logProposalTransition(db, proposal.id, session.user.id, "draft.updated");
  revalidatePath("/proposals");

  return { ok: true, message: "Draft updated." };
}

/**
 * Returns true when a proposal should auto-resolve on submit (solo sleeping or no required invitees).
 */
function shouldAutoResolveOnSubmit(
  proposalType: ProposalType,
  intentionalSolo: boolean,
  requiredInviteeCount: number,
): boolean {
  if (requiredInviteeCount === 0) return true;
  if (proposalType !== "sleeping") return false;
  return intentionalSolo;
}

/**
 * Submits a draft to the network — proposed or auto-resolved for solo sleeping (PC-40).
 * Returns conflict warnings unless `confirm` is true.
 */
export async function submitProposalAction(
  proposalId: string,
  confirm = false,
): Promise<{ ok: boolean; message: string; warnings?: ProposalConflictWarning[] }> {
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

  if (!proposal || proposal.proposerId !== session.user.id || proposal.state !== "draft") {
    return { ok: false, message: "Draft not found." };
  }

  if (!proposal.title.trim() || !proposal.description?.trim()) {
    return { ok: false, message: "Title and description are required before submitting." };
  }

  if (!confirm) {
    const conflictCheck = await checkProposalConflictsAction(proposalId);
    if (conflictCheck.warnings.length > 0) {
      return {
        ok: false,
        message: "Schedule conflicts detected. Review warnings and confirm to submit.",
        warnings: conflictCheck.warnings,
      };
    }
  }

  const invitees = await db
    .select()
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const requiredCount = invitees.filter((row) => row.role === "required").length;
  const autoResolve = shouldAutoResolveOnSubmit(
    proposal.proposalType,
    proposal.intentionalSolo,
    requiredCount,
  );

  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt, endAt: proposalTimeSlots.endAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));

  const schedule = autoResolve ? scheduleFromSlots(slots) : { start: null, end: null };
  const now = new Date().toISOString();
  const nextState: ProposalState = autoResolve ? "resolved" : "proposed";

  await db
    .update(proposals)
    .set({
      state: nextState,
      scheduledStartAt: schedule.start,
      scheduledEndAt: schedule.end,
      atRisk: false,
      atRiskExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposalId));

  await logProposalTransition(
    db,
    proposalId,
    session.user.id,
    autoResolve ? "proposal.auto_resolved" : "proposal.submitted",
    JSON.stringify({ nextState, requiredInviteeCount: requiredCount }),
  );

  const notificationMessage = autoResolve
    ? `Proposal "${proposal.title}" was auto-approved.`
    : `Proposal "${proposal.title}" needs your review.`;

  const notifyIds = new Set<string>(invitees.map((row) => row.userId));
  for (const userId of notifyIds) {
    await notifyUser(userId, "proposal_submitted", notificationMessage, {
      proposalId,
      proposalTitle: proposal.title,
      proposerId: session.user.id,
      state: nextState,
    });
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return {
    ok: true,
    message: autoResolve
      ? "Proposal auto-approved and resolved."
      : "Proposal submitted to your network.",
  };
}

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
  await expireAtRiskProposals(db);
  const isAdmin = await userHasAdminAccess(session.user.role);

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
      locationName: locations.name,
      intentionalSolo: proposals.intentionalSolo,
      isPoll: proposals.isPoll,
      eventPrivacy: proposals.eventPrivacy,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      winningSlotId: proposals.winningSlotId,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Proposal not found." };
  }

  const inviteeRows = await db
    .select({
      userId: proposalInvitees.userId,
      displayName: users.displayName,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(eq(proposalInvitees.proposalId, proposalId));

  const inviteeUserIds = inviteeRows.map((invitee) => invitee.userId);
  if (row.state === "draft" && row.proposerId !== session.user.id) {
    return { ok: false, message: "Proposal not found." };
  }
  if (
    row.state !== "draft" &&
    !viewerCanSeeProposal(session.user.id, isAdmin, row.proposerId, inviteeUserIds)
  ) {
    return { ok: false, message: "Proposal not found." };
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
    })
    .from(proposalComments)
    .innerJoin(users, eq(proposalComments.authorId, users.id))
    .where(eq(proposalComments.proposalId, proposalId))
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
  const canManage = isProposer || isAdmin;

  return {
    ok: true,
    message: "Loaded.",
    detail: {
      id: row.id,
      title: row.title,
      description: row.description,
      notes: row.notes,
      proposalType: row.proposalType,
      state: row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationId: row.locationId ?? null,
      locationName: row.locationName ?? null,
      intentionalSolo: row.intentionalSolo,
      isPoll: row.isPoll,
      eventPrivacy: row.eventPrivacy,
      scheduledStartAt: row.scheduledStartAt ?? null,
      scheduledEndAt: row.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      invitees: inviteeRows.map((invitee) => ({
        userId: invitee.userId,
        displayName: invitee.displayName,
        role: invitee.role,
        voteStatus: invitee.voteStatus,
      })),
      timeSlots: slotRows.map((slot) => ({
        id: slot.id,
        startAt: slot.startAt,
        endAt: slot.endAt ?? null,
        label: slot.label ?? null,
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
      })),
      stateLog: logRows.map((entry) => ({
        action: entry.action,
        actorName: entry.actorName ?? null,
        details: entry.details ?? null,
        createdAt: entry.createdAt,
      })),
      canEdit: row.state === "draft" && isProposer,
      canVote:
        !isPollMatrix &&
        ((row.state === "proposed" &&
          viewerInvitee !== undefined &&
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
        (isProposer || isAdmin) && row.state === "resolved",
      canComment:
        row.state !== "draft" &&
        row.state !== "archived" &&
        viewerCanSeeProposal(session.user.id, isAdmin, row.proposerId, inviteeUserIds),
      canCancel: canManage && (row.state === "proposed" || row.state === "resolved"),
      canRedraft: isProposer && row.state === "resolved",
      viewerVoteStatus: viewerInvitee?.voteStatus ?? null,
      viewerSlotVotes,
    },
  };
}

/**
 * Records an invitee vote and advances workflow when thresholds are met (PC-40).
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

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);
  if (!proposal) {
    return { ok: false, message: "Proposal is not open for voting." };
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

  const isOptionalResolvedVote =
    proposal.state === "resolved" && invitee.role === "optional" && invitee.voteStatus === "not_seen";
  const isProposedVote = proposal.state === "proposed" && invitee.voteStatus === "not_seen";

  if (!isOptionalResolvedVote && !isProposedVote) {
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

  if (invitee.voteStatus !== "not_seen" && invitee.role === "required") {
    return { ok: false, message: "You have already voted on this proposal." };
  }

  const now = new Date().toISOString();
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
    "proposal.vote_cast",
    JSON.stringify({ vote: parsed.data.vote, role: invitee.role }),
  );

  await notifyUser(proposal.proposerId, "proposal_vote_cast", `A vote was cast on "${proposal.title}".`, {
    proposalId: proposal.id,
    voterId: session.user.id,
    vote: parsed.data.vote,
  });

  if (invitee.role === "required") {
    await evaluateProposalAfterVote(db, proposal.id, session.user.id);
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Vote recorded." };
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

/**
 * Creates multiple sleeping draft proposals from a date range (PC-40).
 */
export async function createBatchSleepingProposalsAction(
  input: z.infer<typeof batchSleepingSchema>,
): Promise<{ ok: boolean; message: string; proposalIds?: string[] }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = batchSleepingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();

  const locationCheck = await assertLocationAllowed(
    db,
    session.user.id,
    session.user.role,
    parsed.data.locationId,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const rangeStart = new Date(parsed.data.rangeStart);
  const rangeEnd = new Date(parsed.data.rangeEnd);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return { ok: false, message: "Invalid date range." };
  }
  if (rangeEnd <= rangeStart) {
    return { ok: false, message: "End date must be after start date." };
  }

  const nights: Date[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(22, 0, 0, 0);

  while (cursor <= rangeEnd) {
    const day = cursor.getDay();
    const isWeekend = day === 0 || day === 6;
    const include =
      parsed.data.nightsPattern === "every" ||
      (parsed.data.nightsPattern === "weekends" && isWeekend) ||
      (parsed.data.nightsPattern === "weekdays" && !isWeekend);

    if (include) nights.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  if (nights.length === 0) {
    return { ok: false, message: "No nights matched the selected pattern." };
  }
  if (nights.length > 14) {
    return { ok: false, message: "Batch limited to 14 nights at a time." };
  }

  const batchGroupId = `batch-${randomUUID()}`;
  const proposalIds: string[] = [];
  const now = new Date().toISOString();
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);

  for (const night of nights) {
    const end = new Date(night);
    end.setDate(end.getDate() + 1);
    end.setHours(8, 0, 0, 0);

    const proposalId = `prop-${randomUUID()}`;
    const nightLabel = night.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    await db.insert(proposals).values({
      id: proposalId,
      title: `${parsed.data.title} — ${nightLabel}`,
      description: parsed.data.description,
      proposalType: "sleeping",
      state: "draft",
      proposerId: session.user.id,
      locationId: parsed.data.locationId ?? null,
      notes: parsed.data.notes ?? null,
      intentionalSolo,
      isPoll: false,
      eventPrivacy: "open",
      batchGroupId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId,
      startAt: night.toISOString(),
      endAt: end.toISOString(),
      label: nightLabel,
      sortOrder: 0,
      createdAt: now,
    });

    if (parsed.data.invitees?.length) {
      await replaceInvitees(db, proposalId, session.user.id, parsed.data.invitees);
    }

    await logProposalTransition(db, proposalId, session.user.id, "draft.batch_created", batchGroupId);
    proposalIds.push(proposalId);
  }

  revalidatePath("/proposals");
  return {
    ok: true,
    message: `Created ${proposalIds.length} sleeping drafts.`,
    proposalIds,
  };
}

/**
 * Adds or removes optional attendees on a resolved proposal (PC-40).
 */
export async function updateResolvedAttendeesAction(
  input: z.infer<typeof attendeeUpdateSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = attendeeUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const isAdmin = await userHasAdminAccess(session.user.role);

  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, parsed.data.proposalId))
    .limit(1);

  if (!proposal || proposal.state !== "resolved") {
    return { ok: false, message: "Proposal is not resolved." };
  }

  if (proposal.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Only the proposer or an admin can update attendees." };
  }

  const now = new Date().toISOString();

  for (const userId of parsed.data.removeUserIds ?? []) {
    const [row] = await db
      .select()
      .from(proposalInvitees)
      .where(
        and(
          eq(proposalInvitees.proposalId, proposal.id),
          eq(proposalInvitees.userId, userId),
          eq(proposalInvitees.role, "optional"),
        ),
      )
      .limit(1);

    if (row) {
      await db.delete(proposalSlotVotes).where(
        and(
          eq(proposalSlotVotes.proposalId, proposal.id),
          eq(proposalSlotVotes.userId, userId),
        ),
      );
      await db.delete(proposalInvitees).where(eq(proposalInvitees.id, row.id));
    }
  }

  for (const userId of parsed.data.addOptional ?? []) {
    if (userId === proposal.proposerId) continue;

    const [existing] = await db
      .select({ id: proposalInvitees.id })
      .from(proposalInvitees)
      .where(
        and(eq(proposalInvitees.proposalId, proposal.id), eq(proposalInvitees.userId, userId)),
      )
      .limit(1);

    if (!existing) {
      await db.insert(proposalInvitees).values({
        id: `pi-${randomUUID()}`,
        proposalId: proposal.id,
        userId,
        role: "optional",
        voteStatus: "not_seen",
        createdAt: now,
      });
      await notifyUser(userId, "proposal_attendee_added", `You were added to "${proposal.title}".`, {
        proposalId: proposal.id,
      });
    }
  }

  await logProposalTransition(db, proposal.id, session.user.id, "proposal.attendees_updated");
  revalidatePath("/proposals");

  return { ok: true, message: "Attendees updated." };
}

/**
 * Deletes a draft owned by the signed-in user (PC-40).
 */
export async function deleteDraftProposalAction(
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

  if (!proposal || proposal.proposerId !== session.user.id || proposal.state !== "draft") {
    return { ok: false, message: "Draft not found." };
  }

  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db.delete(proposalTimeSlots).where(eq(proposalTimeSlots.proposalId, proposalId));
  await db.delete(proposalInvitees).where(eq(proposalInvitees.proposalId, proposalId));
  await db.delete(proposalComments).where(eq(proposalComments.proposalId, proposalId));
  await db.delete(proposalStateLog).where(eq(proposalStateLog.proposalId, proposalId));
  await db.delete(proposals).where(eq(proposals.id, proposalId));

  await logUserActivity(session.user.id, "proposals.draft_delete", proposalId);
  revalidatePath("/proposals");

  return { ok: true, message: "Draft deleted." };
}

/**
 * Adds a comment on a visible proposal (PC-40).
 */
export async function addProposalCommentAction(
  input: z.infer<typeof commentSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  await ensureDbReady();
  const db = getDb();
  const detail = await getProposalDetailAction(parsed.data.proposalId);
  if (!detail.ok || !detail.detail?.canComment) {
    return { ok: false, message: "You cannot comment on this proposal." };
  }

  const now = new Date().toISOString();
  await db.insert(proposalComments).values({
    id: `pc-${randomUUID()}`,
    proposalId: parsed.data.proposalId,
    authorId: session.user.id,
    body: parsed.data.body,
    createdAt: now,
  });

  await logProposalTransition(db, parsed.data.proposalId, session.user.id, "proposal.comment_added");
  revalidatePath("/proposals");

  return { ok: true, message: "Comment added." };
}

/**
 * Archives a proposed or resolved proposal (proposer or admin, PC-40).
 */
export async function cancelProposalAction(
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

  if (!proposal || (proposal.state !== "proposed" && proposal.state !== "resolved")) {
    return { ok: false, message: "Proposal cannot be cancelled." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
  if (proposal.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Only the proposer or an admin can cancel." };
  }

  const now = new Date().toISOString();
  await db
    .update(proposals)
    .set({
      state: "archived",
      scheduledStartAt: null,
      scheduledEndAt: null,
      atRisk: false,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposalId));

  await logProposalTransition(db, proposalId, session.user.id, "proposal.cancelled");
  await notifyProposalStakeholders(
    db,
    proposal,
    "proposal_cancelled",
    `Proposal "${proposal.title}" was cancelled.`,
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");

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
  const expiresAt = new Date(Date.now() + AT_RISK_TTL_MS).toISOString();
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
  await notifyProposalStakeholders(
    db,
    proposal,
    "proposal_redrafted",
    `Proposal "${proposal.title}" was moved back to drafts for editing.`,
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Proposal moved to drafts. Calendar entry flagged at-risk until resubmitted." };
}
