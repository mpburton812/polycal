"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or } from "drizzle-orm";
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
  polyGroup,
  proposalComments,
  proposalInvitees,
  proposalSlotVotes,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
  sleepingPartnerships,
  users,
  type EventPrivacyLevel,
  type InviteeRole,
  type InviteeVoteStatus,
  type ProposalState,
  type ProposalType,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import {
  atRiskExpiresAtIso,
  computeAtRiskExpiresAt,
  detectViewerOverlapWarning,
  intervalsOverlap,
  loadEnforcementSettings,
  runProposalEnforcement,
} from "@/lib/proposals/enforcement";
import { PARTNERSHIP_CARD_PREFIX } from "@/lib/proposals/constants";
import { buildPartnershipProposalCopy } from "@/lib/partnerships/copy";
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

const recurrenceRuleSchema = z.object({
  pattern: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(12).default(1),
  count: z.number().int().min(2).max(52),
});

const draftProposalSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  proposalType: z.enum(["event", "sleeping"]),
  locationId: z.string().optional(),
  locationText: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  intentionalSolo: z.boolean().optional(),
  isPoll: z.boolean().optional(),
  eventPrivacy: z.enum(["open", "private", "super_private"]).optional(),
  invitees: z.array(inviteeInputSchema).optional(),
  timeSlots: z.array(timeSlotInputSchema).max(10).optional(),
  isRecurring: z.boolean().optional(),
  recurrenceRule: recurrenceRuleSchema.optional(),
  bedroomIndex: z.number().int().min(0).max(19).optional(),
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
  description: z.string().trim().max(2000).optional(),
  locationId: z.string().optional(),
  locationText: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(500).optional(),
  intentionalSolo: z.boolean().optional(),
  invitees: z.array(inviteeInputSchema).optional(),
  rangeStart: z.string().min(1),
  rangeEnd: z.string().min(1),
  nightsPattern: z.enum(["every", "weekdays", "weekends"]),
});

const attendeeUpdateSchema = z.object({
  proposalId: z.string().min(1),
  addRequired: z.array(z.string().min(1)).optional(),
  addOptional: z.array(z.string().min(1)).optional(),
  removeUserIds: z.array(z.string().min(1)).optional(),
});

const attendeeUpdateResponseSchema = z.object({
  proposalId: z.string().min(1),
  response: z.enum(["maintain", "decline"]),
});

const rescheduleProposalSchema = z.object({
  proposalId: z.string().min(1),
  scheduledStartAt: z.string().min(1),
  scheduledEndAt: z.string().optional(),
});

export type ProposalCardKind = "proposal" | "partnership";

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
  eventPrivacy: EventPrivacyLevel;
  isContentMasked: boolean;
  /** True when the viewer must act on a proposed item. */
  needsViewerAction: boolean;
  inviteeCount: number;
  respondedCount: number;
  isPastSchedule: boolean;
  cardKind?: ProposalCardKind;
  partnershipId?: string;
  partnerName?: string;
}

export type RecurrencePattern = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  pattern: RecurrencePattern;
  interval: number;
  count: number;
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
  bedroomCount: number;
  bedroomNames: string[];
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
  /** Bedroom or place asset lock conflict (PC-40). */
  conflictKind?: "schedule" | "place_asset";
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
  locationText: string | null;
  locationName: string | null;
  intentionalSolo: boolean;
  isPoll: boolean;
  eventPrivacy: EventPrivacyLevel;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  atRisk: boolean;
  isContentMasked: boolean;
  isRecurring: boolean;
  isRecurrenceParent: boolean;
  parentProposalId: string | null;
  recurrenceRule: RecurrenceRule | null;
  occurrenceIndex: number | null;
  bedroomIndex: number | null;
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
  canClone: boolean;
  canReschedule: boolean;
  canRevokeAcceptance: boolean;
  viewerVoteStatus: InviteeVoteStatus | null;
  viewerSlotVotes: Record<string, InviteeVoteStatus>;
  /** True when the viewer already voted but their calendar now conflicts (PC-45/46). */
  hasOverlapWarning: boolean;
  canAcknowledgeOverlap: boolean;
  /** Optional invitee still voting on a poll after required attendees resolved (PC-49). */
  optionalPollPending: boolean;
  /** Kanban/detail chip state — may show proposed while DB state is resolved (PC-49). */
  displayState: ProposalState;
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
const APPROVING_SLOT_VOTES: InviteeVoteStatus[] = ["accept", "abstain", "accept_suboptimal"];

const MASKED_TITLE = "Private event";
const MASKED_DESCRIPTION = "Details are hidden for your privacy level.";

function parseRecurrenceRule(raw: string | null): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RecurrenceRule;
    if (!parsed.pattern || !parsed.count) return null;
    return parsed;
  } catch {
    return null;
  }
}

function serializeRecurrenceRule(rule: RecurrenceRule | undefined): string | null {
  if (!rule) return null;
  return JSON.stringify(rule);
}

/** Poly-group admin visibility toggles for private proposals (PC-40). */
async function getPrivacyAdminFlags(
  db: ReturnType<typeof getDb>,
): Promise<{ adminCanSeePrivate: boolean; adminCanSeeSuperPrivate: boolean }> {
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  return {
    adminCanSeePrivate: group?.adminCanSeePrivate ?? false,
    adminCanSeeSuperPrivate: group?.adminCanSeeSuperPrivate ?? false,
  };
}

/** Loads proposal audit-log visibility policy from poly group settings (PC-45). */
async function getAuditLogVisibility(
  db: ReturnType<typeof getDb>,
): Promise<(typeof polyGroup.$inferSelect)["auditLogVisibility"]> {
  const [group] = await db
    .select({ auditLogVisibility: polyGroup.auditLogVisibility })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);
  return group?.auditLogVisibility ?? "admin_only";
}

/**
 * Filters proposal state log entries per poly-group audit visibility (PC-45).
 */
function filterStateLogForViewer(
  logRows: ProposalStateLogView[],
  visibility: string,
  viewerId: string,
  isAdmin: boolean,
  isProposer: boolean,
  isInvitee: boolean,
): ProposalStateLogView[] {
  if (visibility === "everyone") return logRows;
  if (visibility === "admin_only") return isAdmin ? logRows : [];
  if (visibility === "proposer_admin") {
    return isAdmin || isProposer ? logRows : [];
  }
  if (visibility === "invitees_proposer_admin") {
    return isAdmin || isProposer || isInvitee ? logRows : [];
  }
  return isAdmin ? logRows : [];
}

/** Parses proposed group name from a group_name proposal description (PC-45). */
function parseGroupNameProposalMeta(description: string | null): string | null {
  if (!description) return null;
  try {
    const parsed = JSON.parse(description) as { proposedName?: string };
    return typeof parsed.proposedName === "string" ? parsed.proposedName.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Whether resolved/archived card content should be masked for the viewer (PC-40).
 */
function shouldMaskProposalContent(
  viewerId: string,
  isAdmin: boolean,
  proposerId: string,
  inviteeUserIds: string[],
  eventPrivacy: EventPrivacyLevel,
  adminCanSeePrivate: boolean,
  adminCanSeeSuperPrivate: boolean,
  state: ProposalState,
): boolean {
  if (state !== "resolved" && state !== "archived") return false;
  if (eventPrivacy === "open") return false;
  if (proposerId === viewerId || inviteeUserIds.includes(viewerId)) return false;
  if (eventPrivacy === "private" && isAdmin && adminCanSeePrivate) return false;
  if (eventPrivacy === "super_private" && isAdmin && adminCanSeeSuperPrivate) return false;
  return true;
}

function applyProposalMask<T extends {
  title: string;
  description: string | null;
  locationName: string | null;
  locationText?: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  notes?: string | null;
}>(row: T, masked: boolean): T {
  if (!masked) return row;
  return {
    ...row,
    title: MASKED_TITLE,
    description: MASKED_DESCRIPTION,
    locationName: null,
    locationText: row.locationText !== undefined ? null : undefined,
    scheduledStartAt: null,
    scheduledEndAt: null,
    notes: row.notes !== undefined ? null : undefined,
  };
}

/** Counts slots where every required invitee voted accept/abstain/sub-optimal (PC-40). */
function countMutuallyAgreeableSlots(
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
function requiredCompletedPollMatrix(
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

/**
 * True when an optional invitee still owes poll matrix votes on a resolved poll (PC-49).
 */
function optionalPollVotesPending(
  proposal: { state: ProposalState; isPoll: boolean },
  invitee: { role: InviteeRole; voteStatus: InviteeVoteStatus } | undefined,
  pollSlotCount: number,
): boolean {
  return (
    proposal.state === "resolved" &&
    proposal.isPoll &&
    pollSlotCount > 1 &&
    invitee?.role === "optional" &&
    invitee.voteStatus === "not_seen"
  );
}

/** Advances a date by recurrence pattern for occurrence generation (PC-40 MVP). */
function advanceOccurrenceDate(date: Date, pattern: RecurrencePattern, interval: number): Date {
  const next = new Date(date);
  switch (pattern) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * interval);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + interval);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      break;
  }
  return next;
}

/** Builds ISO occurrence windows from the first slot and recurrence rule (PC-40). */
function buildRecurrenceOccurrences(
  baseStart: string,
  baseEnd: string | null,
  rule: RecurrenceRule,
): { startAt: string; endAt: string | null }[] {
  const occurrences: { startAt: string; endAt: string | null }[] = [];
  let cursorStart = new Date(baseStart);
  let cursorEnd = baseEnd ? new Date(baseEnd) : null;
  const durationMs =
    cursorEnd && !Number.isNaN(cursorEnd.getTime())
      ? cursorEnd.getTime() - cursorStart.getTime()
      : 0;

  for (let index = 0; index < rule.count; index += 1) {
    const startAt = cursorStart.toISOString();
    const endAt =
      cursorEnd && durationMs > 0
        ? new Date(cursorStart.getTime() + durationMs).toISOString()
        : baseEnd;
    occurrences.push({ startAt, endAt: endAt ?? null });
    if (index < rule.count - 1) {
      cursorStart = advanceOccurrenceDate(cursorStart, rule.pattern, rule.interval);
      if (cursorEnd) {
        cursorEnd = advanceOccurrenceDate(cursorEnd, rule.pattern, rule.interval);
      }
    }
  }
  return occurrences;
}

function slotsFingerprint(
  slots: { startAt: string; endAt?: string | null; label?: string | null }[],
): string {
  return slots
    .map((slot) => `${slot.startAt}|${slot.endAt ?? ""}|${slot.label ?? ""}`)
    .sort()
    .join(";");
}

/** Returns true when time, location, or poll slots changed enough to wipe votes (PC-40). */
function criticalProposalFieldsChanged(
  before: typeof proposals.$inferSelect,
  afterLocationId: string | null,
  afterSlots: { startAt: string; endAt?: string | null; label?: string | null }[],
  beforeSlots: { startAt: string; endAt: string | null; label: string | null }[],
): boolean {
  if ((before.locationId ?? null) !== afterLocationId) return true;
  if (slotsFingerprint(beforeSlots) !== slotsFingerprint(afterSlots)) return true;
  if (
    before.scheduledStartAt &&
    afterSlots[0] &&
    before.scheduledStartAt !== afterSlots[0].startAt
  ) {
    return true;
  }
  return false;
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
  await runProposalEnforcement(db);
  const viewerId = session.user.id;
  const isAdmin = await userHasAdminAccess(session.user.role);
  const privacyFlags = await getPrivacyAdminFlags(db);
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
      locationText: proposals.locationText,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      isPoll: proposals.isPoll,
      eventPrivacy: proposals.eventPrivacy,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .leftJoin(locations, eq(proposals.locationId, locations.id))
    .orderBy(asc(proposals.updatedAt));

  const inviteeRows = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees);

  const inviteesByProposal = new Map<string, typeof inviteeRows>();
  for (const row of inviteeRows) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row);
    inviteesByProposal.set(row.proposalId, list);
  }

  const pollSlotCountRows = await db
    .select({
      proposalId: proposalTimeSlots.proposalId,
    })
    .from(proposalTimeSlots)
    .innerJoin(proposals, eq(proposalTimeSlots.proposalId, proposals.id))
    .where(eq(proposals.isPoll, true));

  const pollSlotCounts = new Map<string, number>();
  for (const slotRow of pollSlotCountRows) {
    pollSlotCounts.set(slotRow.proposalId, (pollSlotCounts.get(slotRow.proposalId) ?? 0) + 1);
  }

  const empty: ProposalBoard = { draft: [], proposed: [], resolved: [], archived: [] };

  for (const row of rows) {
    const invitees = inviteesByProposal.get(row.id) ?? [];
    const inviteeUserIds = invitees.map((invitee) => invitee.userId);

    if (row.state === "draft") {
      if (row.proposerId !== viewerId) continue;
    } else if (row.state === "proposed") {
      if (!viewerCanSeeProposal(viewerId, isAdmin, row.proposerId, inviteeUserIds)) continue;
    }

    const masked = shouldMaskProposalContent(
      viewerId,
      isAdmin,
      row.proposerId,
      inviteeUserIds,
      row.eventPrivacy,
      privacyFlags.adminCanSeePrivate,
      privacyFlags.adminCanSeeSuperPrivate,
      row.state,
    );
    const display = applyProposalMask(row, masked);

    const viewerInvitee = invitees.find((invitee) => invitee.userId === viewerId);
    const pollSlotCount = pollSlotCounts.get(row.id) ?? 0;
    const optionalPollPending = optionalPollVotesPending(row, viewerInvitee, pollSlotCount);
    const respondedCount = invitees.filter((inv) => inv.voteStatus !== "not_seen").length;
    const needsViewerAction =
      !masked &&
      viewerInvitee !== undefined &&
      viewerInvitee.voteStatus === "not_seen" &&
      (row.state === "proposed" ||
        (row.state === "resolved" && row.atRisk) ||
        optionalPollPending);

    const scheduleEnd = display.scheduledEndAt ?? display.scheduledStartAt;
    const isPastSchedule = Boolean(scheduleEnd && scheduleEnd < nowIso);

    const card: ProposalCard = {
      id: row.id,
      title: display.title,
      description: display.description,
      proposalType: row.proposalType,
      state: optionalPollPending ? "proposed" : row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationName: display.locationName ?? display.locationText ?? null,
      scheduledStartAt: display.scheduledStartAt ?? null,
      scheduledEndAt: display.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      isPoll: row.isPoll,
      eventPrivacy: row.eventPrivacy,
      isContentMasked: masked,
      needsViewerAction,
      inviteeCount: invitees.length,
      respondedCount,
      isPastSchedule,
    };

    const column: keyof ProposalBoard = optionalPollPending
      ? "proposed"
      : (row.state as keyof ProposalBoard);
    empty[column].push(card);
  }

  const partnershipRows = await db
    .select({
      id: sleepingPartnerships.id,
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
      proposedById: sleepingPartnerships.proposedById,
      initiatedByUserId: sleepingPartnerships.initiatedByUserId,
      proposerName: users.displayName,
    })
    .from(sleepingPartnerships)
    .innerJoin(users, eq(sleepingPartnerships.proposedById, users.id))
    .where(eq(sleepingPartnerships.status, "proposed"));

  if (partnershipRows.length > 0) {
    const partnerIds = new Set<string>();
    for (const row of partnershipRows) {
      partnerIds.add(row.userLowId);
      partnerIds.add(row.userHighId);
      if (row.initiatedByUserId) partnerIds.add(row.initiatedByUserId);
    }
    const partnerRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...partnerIds]));
    const partnerMap = new Map(partnerRows.map((row) => [row.id, row.displayName]));

    for (const row of partnershipRows) {
      const isParticipant =
        row.userLowId === viewerId || row.userHighId === viewerId;
      if (!isParticipant && !isAdmin) continue;

      const partnerId =
        row.userLowId === viewerId ? row.userHighId : row.userLowId;
      const partnerName = partnerMap.get(partnerId) ?? "Partner";
      const lowName = partnerMap.get(row.userLowId) ?? "Member";
      const highName = partnerMap.get(row.userHighId) ?? "Member";
      const initiatedByName = row.initiatedByUserId
        ? (partnerMap.get(row.initiatedByUserId) ?? null)
        : null;
      const copy = buildPartnershipProposalCopy({
        viewerId,
        userLowId: row.userLowId,
        userHighId: row.userHighId,
        proposedById: row.proposedById,
        proposerName: row.proposerName,
        initiatedByName,
        partnerName,
        lowName,
        highName,
      });

      empty.proposed.push({
        id: `${PARTNERSHIP_CARD_PREFIX}${row.id}`,
        title: `Sleeping partnership with ${partnerName}`,
        description: copy.description,
        proposalType: "event",
        state: "proposed",
        proposerId: row.proposedById,
        proposerName: copy.proposerDisplayName,
        locationName: null,
        scheduledStartAt: null,
        scheduledEndAt: null,
        atRisk: false,
        isPoll: false,
        eventPrivacy: "open",
        isContentMasked: false,
        needsViewerAction: copy.needsViewerAction,
        inviteeCount: 1,
        respondedCount: copy.needsViewerAction ? 0 : 0,
        isPastSchedule: false,
        cardKind: "partnership",
        partnershipId: row.id,
        partnerName,
      });
    }
  }

  return empty;
}

/** Parses bedroom label JSON stored on locations (PC-40). */
function parseBedroomNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function mapPlaceOption(row: {
  id: string;
  name: string;
  bedroomCount: number;
  bedroomNames: string | null;
}): ProposalPlaceOption {
  const names = parseBedroomNames(row.bedroomNames);
  return {
    id: row.id,
    name: row.name,
    bedroomCount: row.bedroomCount,
    bedroomNames:
      names.length > 0
        ? names
        : Array.from({ length: row.bedroomCount }, (_, index) => `Bedroom ${index + 1}`),
  };
}

/**
 * Location IDs the user may schedule at — own residency plus sleeping partners' places (PC-43).
 */
async function getEligibleLocationIdsForUser(
  db: ReturnType<typeof getDb>,
  userId: string,
): Promise<string[]> {
  const directRows = await db
    .select({ locationId: locationResidents.locationId })
    .from(locationResidents)
    .where(
      and(eq(locationResidents.userId, userId), eq(locationResidents.status, "accepted")),
    );

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

  const partnerIds = partnershipRows.map((row) =>
    row.userLowId === userId ? row.userHighId : row.userLowId,
  );

  let networkLocationIds: string[] = [];
  if (partnerIds.length > 0) {
    const partnerResidency = await db
      .select({ locationId: locationResidents.locationId })
      .from(locationResidents)
      .where(
        and(
          inArray(locationResidents.userId, partnerIds),
          eq(locationResidents.status, "accepted"),
        ),
      );
    networkLocationIds = partnerResidency.map((row) => row.locationId);
  }

  return [...new Set([...directRows.map((row) => row.locationId), ...networkLocationIds])];
}

/**
 * Places the current user may attach to a proposal draft (direct + sleeping network residency).
 */
export async function listProposalPlaceOptionsAction(): Promise<ProposalPlaceOption[]> {
  await ensureDbReady();
  const session = await auth();
  if (!session?.user) return [];

  const db = getDb();
  const isAdmin = await userHasAdminAccess(session.user.role);

  const placeSelect = {
    id: locations.id,
    name: locations.name,
    bedroomCount: locations.bedroomCount,
    bedroomNames: locations.bedroomNames,
  };

  if (isAdmin) {
    const all = await db.select(placeSelect).from(locations).orderBy(asc(locations.name));
    return all.map(mapPlaceOption);
  }

  const locationIds = await getEligibleLocationIdsForUser(db, session.user.id);
  if (locationIds.length === 0) return [];

  const placeRows = await db
    .select(placeSelect)
    .from(locations)
    .where(inArray(locations.id, locationIds))
    .orderBy(asc(locations.name));

  return placeRows.map(mapPlaceOption);
}

/**
 * Validates the viewer may use a location on a proposal.
 */
async function assertLocationAllowed(
  db: ReturnType<typeof getDb>,
  userId: string,
  role: string,
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

  if (await userHasAdminAccess(role as UserRole)) {
    return { ok: true };
  }

  const eligibleIds = await getEligibleLocationIdsForUser(db, userId);
  if (!eligibleIds.includes(locationId)) {
    return {
      ok: false,
      error:
        "You can only schedule at places you or your sleeping partners are associated with.",
    };
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
  await wipeProposalVotes(db, proposalId);
}

/**
 * Flags a resolved proposal at-risk and returns it to proposed for re-approval (PC-48 / spec §9).
 */
async function enterAtRiskProposedState(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  actorUserId: string,
  reason: string,
): Promise<void> {
  const enforcement = await loadEnforcementSettings(db);
  const expiresAt = computeAtRiskExpiresAt(enforcement, proposal.scheduledStartAt);
  const now = new Date().toISOString();

  await db
    .update(proposals)
    .set({
      state: "proposed",
      atRisk: true,
      atRiskExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  await resetInviteeVotes(db, proposal.id);
  await logProposalTransition(db, proposal.id, actorUserId, "proposal.at_risk", reason);

  await notifyUser(
    proposal.proposerId,
    "proposal_at_risk",
    `Proposal "${proposal.title}" is at risk. Cancel, re-draft, or update attendees.`,
    { proposalId: proposal.id, action: "at_risk_options" },
  );

  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposal.id));

  for (const row of invitees) {
    if (row.userId === proposal.proposerId) continue;
    await notifyUser(
      row.userId,
      "proposal_at_risk",
      `Proposal "${proposal.title}" is tentative/at risk on the calendar until re-approved.`,
      { proposalId: proposal.id, action: "vote" },
    );
  }
}

/** Clears invitee votes, slot matrix votes, and winning slot (PC-40). */
async function wipeProposalVotes(db: ReturnType<typeof getDb>, proposalId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ voteStatus: "not_seen", respondedAt: null, overlapAcknowledgedAt: null })
    .where(eq(proposalInvitees.proposalId, proposalId));
  await db.delete(proposalSlotVotes).where(eq(proposalSlotVotes.proposalId, proposalId));
  await db
    .update(proposals)
    .set({ winningSlotId: null, updatedAt: now })
    .where(eq(proposals.id, proposalId));
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
 * Builds schedule windows for collision checks from slots or resolved times (PC-40).
 */
async function proposalScheduleWindows(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  scheduledStartAt: string | null,
  scheduledEndAt: string | null,
): Promise<{ start: string; end: string | null }[]> {
  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt, endAt: proposalTimeSlots.endAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId));

  if (slots.length > 0) {
    return slots.map((slot) => ({ start: slot.startAt, end: slot.endAt }));
  }
  if (scheduledStartAt) {
    return [{ start: scheduledStartAt, end: scheduledEndAt }];
  }
  return [];
}

/**
 * On resolve, auto-declines overlapping pending proposals into proposer review (PC-40).
 * Conflicting items revert to draft with at-risk flag and a system comment.
 */
async function autoDeclineCollidingProposals(
  db: ReturnType<typeof getDb>,
  resolved: typeof proposals.$inferSelect,
  scheduleStart: string | null,
  scheduleEnd: string | null,
  actorUserId: string,
): Promise<void> {
  if (!scheduleStart) return;

  const resolvedInvitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, resolved.id));
  const resolvedStakeholders = new Set<string>([
    resolved.proposerId,
    ...resolvedInvitees.map((row) => row.userId),
  ]);

  const pending = await db
    .select()
    .from(proposals)
    .where(eq(proposals.state, "proposed"));

  const allInvitees = await db
    .select({
      proposalId: proposalInvitees.proposalId,
      userId: proposalInvitees.userId,
    })
    .from(proposalInvitees);
  const inviteesByProposal = new Map<string, string[]>();
  for (const row of allInvitees) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row.userId);
    inviteesByProposal.set(row.proposalId, list);
  }

  const now = new Date().toISOString();
  const enforcement = await loadEnforcementSettings(db);
  const expiresAt = atRiskExpiresAtIso(enforcement);

  for (const other of pending) {
    if (other.id === resolved.id) continue;

    const otherStakeholders = new Set<string>([
      other.proposerId,
      ...(inviteesByProposal.get(other.id) ?? []),
    ]);
    const sharesStakeholder = [...resolvedStakeholders].some((id) =>
      otherStakeholders.has(id),
    );
    if (!sharesStakeholder) continue;

    const otherWindows = await proposalScheduleWindows(
      db,
      other.id,
      other.scheduledStartAt,
      other.scheduledEndAt,
    );
    if (otherWindows.length === 0) continue;

    const overlaps = otherWindows.some((window) =>
      intervalsOverlap(scheduleStart, scheduleEnd, window.start, window.end),
    );
    if (!overlaps) continue;

    await db
      .update(proposals)
      .set({
        state: "draft",
        atRisk: true,
        atRiskExpiresAt: expiresAt,
        scheduledStartAt: null,
        scheduledEndAt: null,
        winningSlotId: null,
        updatedAt: now,
      })
      .where(eq(proposals.id, other.id));

    await resetInviteeVotes(db, other.id);

    await db.insert(proposalComments).values({
      id: `pc-${randomUUID()}`,
      proposalId: other.id,
      authorId: other.proposerId,
      body: `Auto-declined due to resolution of Proposal ID ${resolved.id}.`,
      createdAt: now,
    });

    await logProposalTransition(
      db,
      other.id,
      actorUserId,
      "proposal.auto_declined_collision",
      resolved.id,
    );

    await notifyUser(
      other.proposerId,
      "proposal_collision_auto_decline",
      `Proposal "${other.title}" was auto-declined because "${resolved.title}" was scheduled.`,
      { proposalId: other.id, resolvedProposalId: resolved.id },
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
      atRisk: false,
      atRiskExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  await logProposalTransition(db, proposal.id, actorUserId, "proposal.resolved");

  const proposedName = parseGroupNameProposalMeta(proposal.description);
  if (proposedName) {
    await db
      .update(polyGroup)
      .set({ name: proposedName, updatedAt: now })
      .where(eq(polyGroup.id, 1));
  }

  const invitees = await db
    .select({
      userId: proposalInvitees.userId,
      role: proposalInvitees.role,
      voteStatus: proposalInvitees.voteStatus,
    })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposal.id));

  const pollMatrix = proposal.isPoll && slots.length > 1;
  const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
  for (const userId of notifyIds) {
    const invitee = invitees.find((row) => row.userId === userId);
    const optionalStillVoting =
      pollMatrix &&
      invitee?.role === "optional" &&
      invitee.voteStatus === "not_seen";
    const message = optionalStillVoting
      ? `Proposal "${proposal.title}" was approved by all required attendees and scheduled. Please complete your poll votes.`
      : `Proposal "${proposal.title}" was approved and scheduled.`;
    await notifyUser(userId, "proposal_resolved", message, { proposalId: proposal.id });
  }

  await autoDeclineCollidingProposals(db, proposal, scheduleStart, scheduleEnd, actorUserId);
}

/**
 * Checks whether a proposed item should resolve or revert after a vote (PC-40).
 * Poll proposals wait for all required matrix votes before evaluating mutual slots.
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
  if (
    !proposal ||
    (proposal.state !== "proposed" && !(proposal.state === "resolved" && proposal.atRisk))
  ) {
    return;
  }

  const invitees = await db
    .select()
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const required = invitees.filter((row) => row.role === "required");
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
 * Detects bedroom/place occupancy conflicts for sleeping proposals (PC-40 MVP).
 */
async function checkPlaceAssetConflicts(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  checkWindows: { start: string; end: string | null }[],
  excludeProposalId?: string,
): Promise<ProposalConflictWarning[]> {
  if (proposal.proposalType !== "sleeping" || !proposal.locationId || checkWindows.length === 0) {
    return [];
  }

  const [place] = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, proposal.locationId))
    .limit(1);
  if (!place) return [];

  const sleepingActive = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      state: proposals.state,
      locationId: proposals.locationId,
      bedroomIndex: proposals.bedroomIndex,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
    })
    .from(proposals)
    .where(
      and(
        eq(proposals.proposalType, "sleeping"),
        inArray(proposals.state, ["proposed", "resolved"]),
      ),
    );

  const warnings: ProposalConflictWarning[] = [];
  for (const other of sleepingActive) {
    if (other.id === excludeProposalId || other.id === proposal.id) continue;
    if (other.locationId !== proposal.locationId) continue;
    if (!other.scheduledStartAt) continue;

    const sameBedroom =
      proposal.bedroomIndex === null ||
      other.bedroomIndex === null ||
      proposal.bedroomIndex === other.bedroomIndex;
    if (!sameBedroom) continue;

    for (const window of checkWindows) {
      if (
        intervalsOverlap(
          window.start,
          window.end,
          other.scheduledStartAt,
          other.scheduledEndAt,
        )
      ) {
        warnings.push({
          userId: proposal.proposerId,
          displayName: place.name,
          conflictingTitle: other.title,
          conflictingState: other.state as ProposalState,
          overlapStart: window.start,
          overlapEnd: window.end,
          conflictKind: "place_asset",
        });
        break;
      }
    }
  }

  return warnings;
}

/**
 * Creates child proposal drafts for recurring series occurrences after the parent (PC-40).
 */
async function createRecurringChildProposals(
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
      parentProposalId: parent.id,
      occurrenceIndex: index,
      isRecurrenceParent: false,
      bedroomIndex: parent.bedroomIndex,
      notes: parent.notes,
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

  const placeWarnings = await checkPlaceAssetConflicts(db, proposal, checkWindows, proposalId);
  warnings.push(...placeWarnings);

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
    parsed.data.locationText,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const intentionalSolo = Boolean(parsed.data.intentionalSolo);
  const isPoll = Boolean(parsed.data.isPoll) || (parsed.data.timeSlots?.length ?? 0) > 1;
  const eventPrivacy = parsed.data.eventPrivacy ?? "open";
  const isRecurring = Boolean(parsed.data.isRecurring && parsed.data.recurrenceRule);
  const recurrenceJson = isRecurring
    ? serializeRecurrenceRule(parsed.data.recurrenceRule)
    : null;
  const locationText = parsed.data.locationText?.trim() || null;

  await db.insert(proposals).values({
    id: proposalId,
    title: parsed.data.title,
    description: parsed.data.description,
    proposalType: parsed.data.proposalType,
    state: "draft",
    proposerId: session.user.id,
    locationId: parsed.data.locationId ?? null,
    locationText,
    notes: parsed.data.notes ?? null,
    intentionalSolo,
    isPoll,
    eventPrivacy,
    isRecurrenceParent: isRecurring,
    recurrenceRule: recurrenceJson,
    occurrenceIndex: isRecurring ? 0 : null,
    bedroomIndex: parsed.data.bedroomIndex ?? null,
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
    parsed.data.locationText,
  );
  if (!locationCheck.ok) {
    return { ok: false, message: locationCheck.error };
  }

  const now = new Date().toISOString();
  const isPoll =
    parsed.data.isPoll !== undefined
      ? parsed.data.isPoll
      : (parsed.data.timeSlots?.length ?? 0) > 1;
  const isRecurring = Boolean(parsed.data.isRecurring && parsed.data.recurrenceRule);
  const recurrenceJson = isRecurring
    ? serializeRecurrenceRule(parsed.data.recurrenceRule)
    : proposal.recurrenceRule;

  const existingSlots = await db
    .select({
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposal.id));

  const afterLocationId = parsed.data.locationId ?? null;
  const afterLocationText = parsed.data.locationText?.trim() || null;
  const afterSlots =
    parsed.data.timeSlots?.map((slot) => ({
      startAt: slot.startAt,
      endAt: slot.endAt ?? null,
      label: slot.label ?? null,
    })) ?? existingSlots;

  const criticalChanged = criticalProposalFieldsChanged(
    proposal,
    afterLocationId,
    afterSlots,
    existingSlots,
  );

  await db
    .update(proposals)
    .set({
      title: parsed.data.title,
      description: parsed.data.description,
      proposalType: parsed.data.proposalType,
      locationId: afterLocationId,
      locationText: afterLocationText,
      notes: parsed.data.notes ?? null,
      intentionalSolo: Boolean(parsed.data.intentionalSolo),
      isPoll: Boolean(isPoll),
      eventPrivacy: parsed.data.eventPrivacy ?? proposal.eventPrivacy,
      isRecurrenceParent: isRecurring || proposal.isRecurrenceParent,
      recurrenceRule: recurrenceJson,
      bedroomIndex: parsed.data.bedroomIndex ?? proposal.bedroomIndex,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  if (parsed.data.invitees) {
    await replaceInvitees(db, proposal.id, session.user.id, parsed.data.invitees);
  }

  if (parsed.data.timeSlots) {
    await replaceTimeSlots(db, proposal.id, parsed.data.timeSlots);
  }

  if (criticalChanged || proposal.atRisk) {
    await wipeProposalVotes(db, proposal.id);
  }

  await logProposalTransition(db, proposal.id, session.user.id, "draft.updated");
  revalidatePath("/proposals");

  return { ok: true, message: "Draft updated." };
}

/**
 * Returns true when a proposal should auto-resolve on submit (solo sleeping or no required invitees).
 */
function shouldAutoResolveOnSubmit(
  _proposalType: ProposalType,
  intentionalSolo: boolean,
  requiredInviteeCount: number,
): boolean {
  if (intentionalSolo) return true;
  if (requiredInviteeCount === 0) return false;
  return false;
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

  if (!proposal.title.trim()) {
    return { ok: false, message: "Title is required before submitting." };
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
  if (requiredCount === 0 && !proposal.intentionalSolo) {
    return {
      ok: false,
      message: "Add at least one required invitee or enable solo before submitting.",
    };
  }

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

  if (proposal.atRisk) {
    await wipeProposalVotes(db, proposalId);
  }

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

  const recurrenceRule = parseRecurrenceRule(proposal.recurrenceRule);
  if (proposal.isRecurrenceParent && recurrenceRule && slots.length > 0) {
    const occurrences = buildRecurrenceOccurrences(
      slots[0].startAt,
      slots[0].endAt,
      recurrenceRule,
    );
    const inviteeRows = invitees.map((row) => ({
      userId: row.userId,
      role: row.role as InviteeRole,
    }));
    const [updatedParent] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);
    if (updatedParent) {
      await createRecurringChildProposals(db, updatedParent, occurrences, inviteeRows);
    }
  }

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
  await runProposalEnforcement(db);
  const isAdmin = await userHasAdminAccess(session.user.role);
  const privacyFlags = await getPrivacyAdminFlags(db);
  const auditLogVisibility = await getAuditLogVisibility(db);

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
      eventPrivacy: proposals.eventPrivacy,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      atRisk: proposals.atRisk,
      winningSlotId: proposals.winningSlotId,
      parentProposalId: proposals.parentProposalId,
      recurrenceRule: proposals.recurrenceRule,
      occurrenceIndex: proposals.occurrenceIndex,
      isRecurrenceParent: proposals.isRecurrenceParent,
      bedroomIndex: proposals.bedroomIndex,
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
      overlapAcknowledgedAt: proposalInvitees.overlapAcknowledgedAt,
    })
    .from(proposalInvitees)
    .innerJoin(users, eq(proposalInvitees.userId, users.id))
    .where(eq(proposalInvitees.proposalId, proposalId));

  const inviteeUserIds = inviteeRows.map((invitee) => invitee.userId);
  if (row.state === "draft" && row.proposerId !== session.user.id) {
    return { ok: false, message: "Proposal not found." };
  }
  if (
    row.state === "proposed" &&
    !viewerCanSeeProposal(session.user.id, isAdmin, row.proposerId, inviteeUserIds)
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
  const isInvitee = inviteeUserIds.includes(session.user.id);
  const canManage = isProposer || isAdmin;
  const recurrenceRule = parseRecurrenceRule(row.recurrenceRule);
  const canViewSensitive = !masked;

  const stateLogEntries = canViewSensitive
    ? filterStateLogForViewer(
        logRows.map((entry) => ({
          action: entry.action,
          actorName: entry.actorName ?? null,
          details: entry.details ?? null,
          createdAt: entry.createdAt,
        })),
        auditLogVisibility,
        session.user.id,
        isAdmin,
        isProposer,
        isInvitee,
      )
    : [];

  const hasOverlapWarning = canViewSensitive
    ? await detectViewerOverlapWarning(
        db,
        proposalId,
        session.user.id,
        viewerInvitee?.voteStatus,
        viewerInvitee?.overlapAcknowledgedAt,
        display.scheduledStartAt ?? null,
        display.scheduledEndAt ?? null,
      )
    : false;

  const optionalPollPending = optionalPollVotesPending(row, viewerInvitee, slotRows.length);
  const displayState: ProposalState = optionalPollPending ? "proposed" : row.state;

  return {
    ok: true,
    message: "Loaded.",
    detail: {
      id: row.id,
      title: display.title,
      description: display.description,
      notes: masked ? null : row.notes,
      proposalType: row.proposalType,
      state: row.state,
      proposerId: row.proposerId,
      proposerName: row.proposerName,
      locationId: masked ? null : row.locationId ?? null,
      locationText: masked ? null : row.locationText ?? null,
      locationName: display.locationName ?? display.locationText ?? null,
      intentionalSolo: row.intentionalSolo,
      isPoll: row.isPoll,
      eventPrivacy: row.eventPrivacy,
      scheduledStartAt: display.scheduledStartAt ?? null,
      scheduledEndAt: display.scheduledEndAt ?? null,
      atRisk: row.atRisk,
      isContentMasked: masked,
      isRecurring: Boolean(recurrenceRule || row.parentProposalId),
      isRecurrenceParent: row.isRecurrenceParent,
      parentProposalId: row.parentProposalId ?? null,
      recurrenceRule,
      occurrenceIndex: row.occurrenceIndex ?? null,
      bedroomIndex: masked ? null : row.bedroomIndex ?? null,
      invitees: canViewSensitive
        ? inviteeRows.map((invitee) => ({
            userId: invitee.userId,
            displayName: invitee.displayName,
            role: invitee.role,
            voteStatus: invitee.voteStatus,
          }))
        : [],
      timeSlots: masked
        ? []
        : slotRows.map((slot) => ({
            id: slot.id,
            startAt: slot.startAt,
            endAt: slot.endAt ?? null,
            label: slot.label ?? null,
          })),
      slotVotes: masked
        ? []
        : slotVoteRows.map((vote) => ({
            timeSlotId: vote.timeSlotId,
            userId: vote.userId,
            displayName: vote.displayName,
            voteStatus: vote.voteStatus,
          })),
      winningSlotId: row.winningSlotId ?? null,
      comments: canViewSensitive
        ? commentRows.map((comment) => ({
            id: comment.id,
            authorName: comment.authorName,
            body: comment.body,
            createdAt: comment.createdAt,
          }))
        : [],
      stateLog: stateLogEntries,
      canEdit: row.state === "draft" && isProposer,
      canVote:
        !masked &&
        !isPollMatrix &&
        ((row.state === "proposed" &&
          viewerInvitee !== undefined &&
          viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            row.atRisk &&
            viewerInvitee?.role === "required" &&
            viewerInvitee.voteStatus === "not_seen") ||
          (row.state === "resolved" &&
            viewerInvitee?.role === "optional" &&
            viewerInvitee.voteStatus === "not_seen")),
      canVoteSlots:
        !masked &&
        isPollMatrix &&
        viewerInvitee !== undefined &&
        (row.state === "proposed" || (row.state === "resolved" && viewerInvitee.role === "optional")) &&
        pollSlotsIncomplete,
      canManageAttendees:
        canViewSensitive && (isProposer || isAdmin) && row.state === "resolved",
      canComment:
        canViewSensitive &&
        row.state !== "draft" &&
        row.state !== "archived" &&
        viewerCanSeeProposal(session.user.id, isAdmin, row.proposerId, inviteeUserIds),
      canCancel: canManage && (row.state === "proposed" || row.state === "resolved"),
      canRedraft: isProposer && row.state === "resolved",
      canClone:
        isProposer &&
        (row.state === "resolved" || row.state === "proposed" || row.state === "archived"),
      canReschedule:
        isAdmin &&
        canViewSensitive &&
        (row.state === "proposed" || row.state === "resolved"),
      canRevokeAcceptance:
        !masked &&
        viewerInvitee?.role === "required" &&
        row.state === "resolved" &&
        !row.atRisk &&
        Boolean(
          viewerInvitee?.voteStatus &&
            APPROVING_VOTES.includes(viewerInvitee.voteStatus as InviteeVoteStatus),
        ),
      viewerVoteStatus: viewerInvitee?.voteStatus ?? null,
      viewerSlotVotes: masked ? {} : viewerSlotVotes,
      hasOverlapWarning,
      canAcknowledgeOverlap: hasOverlapWarning,
      optionalPollPending,
      displayState,
    },
  };
}

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
  );

  if (!hasOverlap) {
    return { ok: false, message: "No active overlap warning for this proposal." };
  }

  const now = new Date().toISOString();

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
    `A vote was changed to decline on "${proposal.title}" after a schedule conflict.`,
    { proposalId: proposal.id, voterId: session.user.id, vote: "decline" },
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
  const isAtRiskRequiredVote =
    proposal.state === "resolved" &&
    proposal.atRisk &&
    invitee.role === "required" &&
    invitee.voteStatus === "not_seen";
  const isProposedVote = proposal.state === "proposed" && invitee.voteStatus === "not_seen";

  if (!isOptionalResolvedVote && !isAtRiskRequiredVote && !isProposedVote) {
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
 * Adds or removes attendees on a resolved proposal (PC-40, PC-45).
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
  let attendeesChanged = false;
  let removedRequiredAttendee = false;

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

    await notifyUser(userId, "proposal_attendee_removed", `You were removed from "${proposal.title}".`, {
      proposalId: proposal.id,
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

    await db.insert(proposalInvitees).values({
      id: `pi-${randomUUID()}`,
      proposalId: proposal.id,
      userId,
      role,
      voteStatus: "not_seen",
      createdAt: now,
    });
    attendeesChanged = true;

    if (role === "required") {
      const enforcement = await loadEnforcementSettings(db);
      const expiresAt = computeAtRiskExpiresAt(enforcement, proposal.scheduledStartAt);
      await db
        .update(proposals)
        .set({ atRisk: true, atRiskExpiresAt: expiresAt, updatedAt: now })
        .where(eq(proposals.id, proposal.id));
    }

    await notifyUser(userId, "proposal_attendee_added", `You were added to "${proposal.title}".`, {
      proposalId: proposal.id,
    });
  }

  for (const userId of parsed.data.addRequired ?? []) {
    await addAttendee(userId, "required");
  }

  for (const userId of parsed.data.addOptional ?? []) {
    await addAttendee(userId, "optional");
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
          `Attendees changed on "${proposal.title}" — maintain your acceptance or decline.`,
          { proposalId: proposal.id, action: "attendee_update" },
        );
      }
    }

    await logProposalTransition(db, proposal.id, session.user.id, "proposal.attendees_updated");
  }

  revalidatePath("/proposals");
  revalidatePath("/schedule");

  return { ok: true, message: "Attendees updated." };
}

/** Alias for updateResolvedAttendeesAction (PC-45). */
export const updateProposalAttendeesAction = updateResolvedAttendeesAction;

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
 * Admin-only reschedule of a proposed or resolved calendar event (PC-48 / spec §10).
 */
export async function rescheduleProposalAction(
  input: z.infer<typeof rescheduleProposalSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
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

  if (!proposal || (proposal.state !== "proposed" && proposal.state !== "resolved")) {
    return { ok: false, message: "Proposal cannot be rescheduled." };
  }

  const now = new Date().toISOString();
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

  await notifyProposalStakeholders(
    db,
    proposal,
    "proposal_rescheduled",
    `Proposal "${proposal.title}" was rescheduled by an administrator.`,
  );

  revalidatePath("/proposals");
  revalidatePath("/schedule");
  return { ok: true, message: "Event rescheduled." };
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
 * Clones a proposal into a new draft for the proposer (PC-40).
 */
export async function cloneProposalAction(
  proposalId: string,
): Promise<{ ok: boolean; message: string; newProposalId?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [source] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (
    !source ||
    source.proposerId !== session.user.id ||
    !["resolved", "proposed", "archived"].includes(source.state)
  ) {
    return { ok: false, message: "Proposal cannot be cloned." };
  }

  const inviteeRows = await db
    .select({ userId: proposalInvitees.userId, role: proposalInvitees.role })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const slotRows = await db
    .select({
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
      sortOrder: proposalTimeSlots.sortOrder,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId))
    .orderBy(asc(proposalTimeSlots.sortOrder));

  const now = new Date().toISOString();
  const newId = `prop-${randomUUID()}`;

  await db.insert(proposals).values({
    id: newId,
    title: `${source.title} (copy)`,
    description: source.description,
    proposalType: source.proposalType,
    state: "draft",
    proposerId: session.user.id,
    locationId: source.locationId,
    scheduledStartAt: null,
    scheduledEndAt: null,
    intentionalSolo: source.intentionalSolo,
    eventPrivacy: source.eventPrivacy,
    isPoll: source.isPoll,
    bedroomIndex: source.bedroomIndex,
    notes: source.notes,
    createdAt: now,
    updatedAt: now,
  });

  for (const slot of slotRows) {
    await db.insert(proposalTimeSlots).values({
      id: `pts-${randomUUID()}`,
      proposalId: newId,
      startAt: slot.startAt,
      endAt: slot.endAt,
      label: slot.label,
      sortOrder: slot.sortOrder,
      createdAt: now,
    });
  }

  if (inviteeRows.length > 0) {
    await replaceInvitees(
      db,
      newId,
      session.user.id,
      inviteeRows.map((row) => ({ userId: row.userId, role: row.role as InviteeRole })),
    );
  }

  await logProposalTransition(
    db,
    newId,
    session.user.id,
    "proposal.cloned",
    JSON.stringify({ sourceId: proposalId }),
  );

  revalidatePath("/proposals");
  return { ok: true, message: "Draft created from proposal.", newProposalId: newId };
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

  const isAdmin = await userHasAdminAccess(session.user.role);
  if (proposal.proposerId !== session.user.id && !isAdmin) {
    return { ok: false, message: "Only the proposer or an admin can cancel." };
  }

  const now = new Date().toISOString();
  const actorId = session.user.id;

  async function archiveOne(id: string): Promise<void> {
    await db
      .update(proposals)
      .set({
        state: "archived",
        scheduledStartAt: null,
        scheduledEndAt: null,
        atRisk: false,
        updatedAt: now,
      })
      .where(eq(proposals.id, id));
    await logProposalTransition(db, id, actorId, "proposal.cancelled");
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
