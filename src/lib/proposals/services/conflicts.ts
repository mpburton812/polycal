/**
 * Proposal schedule/asset conflict detection and collision resolution (PC-328).
 *
 * Carved out of `src/actions/proposals/_core.ts` (Epic 4 core carve) without
 * behavior changes: the same widened calendar windows (`buildScheduleWindows`
 * via {@link buildConflictWindows}) drive both the pre-submit warnings and the
 * on-resolve auto-decline sweep, preserving the PC-59/PC-318 conflict contract.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  locations,
  proposalComments,
  proposalInvitees,
  proposalTimeSlots,
  proposals,
  users,
  type ProposalState,
} from "@/lib/db/schema";
import {
  chunkIds,
  loadSlotsByProposalIds,
  type ProposalSlotRow,
} from "@/lib/proposals/services/slot-loader";
import { notifyUser } from "@/lib/notifications";
import {
  atRiskExpiresAtIso,
  loadEnforcementSettings,
} from "@/lib/proposals/enforcement";
import {
  buildConflictWindows,
  widenConflictWindow,
  windowsConflict,
  type ConflictWindow,
} from "@/lib/proposals/conflict-windows";
import { intervalsOverlap } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { resetInviteeVotes } from "@/lib/proposals/services/votes";
import type { ProposalConflictWarning } from "@/actions/proposals/types";

type Db = ReturnType<typeof getDb>;

/**
 * Slack applied to SQL date prefilters so rows that only overlap AFTER window
 * widening (sleeping / all-day windows grow to their civil-day end, at most one
 * day plus timezone offset) are still fetched (PC-355).
 */
const CONFLICT_PREFILTER_PAD_MS = 2 * 24 * 60 * 60 * 1000;

function shiftIso(iso: string, deltaMs: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + deltaMs).toISOString();
}

/** Widest [start, end] envelope covering every conflict window. */
function windowEnvelope(windows: ConflictWindow[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const window of windows) {
    const windowEnd = window.end ?? window.start;
    if (start === null || window.start < start) start = window.start;
    if (end === null || windowEnd > end) end = windowEnd;
  }
  if (start === null || end === null) return null;
  return { start, end };
}

/**
 * SQL bound keeping only rows whose scheduled span can still reach `envelope`
 * once widened. Returns `undefined` (no filter) when there is nothing to bound.
 */
function scheduledWithinEnvelope(envelope: { start: string; end: string } | null) {
  if (!envelope) return undefined;
  const paddedStart = shiftIso(envelope.start, -CONFLICT_PREFILTER_PAD_MS);
  const paddedEnd = shiftIso(envelope.end, CONFLICT_PREFILTER_PAD_MS);
  return and(
    lte(proposals.scheduledStartAt, paddedEnd),
    or(
      gte(proposals.scheduledEndAt, paddedStart),
      and(isNull(proposals.scheduledEndAt), gte(proposals.scheduledStartAt, paddedStart)),
    ),
  );
}

/**
 * Proposal ids any of `userIds` is invited to — the invitee half of "shares a
 * stakeholder". Chunked so a large stakeholder set cannot blow the SQL variable
 * limit (PC-355).
 */
async function proposalIdsForInvitees(db: Db, userIds: string[]): Promise<string[]> {
  const ids = new Set<string>();
  for (const chunk of chunkIds(userIds)) {
    const rows = await db
      .select({ proposalId: proposalInvitees.proposalId })
      .from(proposalInvitees)
      .where(inArray(proposalInvitees.userId, chunk));
    for (const row of rows) ids.add(row.proposalId);
  }
  return [...ids];
}

/**
 * True when a proposal is reachable from `stakeholderIds` — proposer match or a
 * shared invitee. Used as a SQL prefilter so conflict checks scan the viewer's
 * neighbourhood instead of every proposal in the network (PC-355).
 */
function stakeholderReachFilter(stakeholderIds: string[], sharedProposalIds: string[]) {
  const clauses = [inArray(proposals.proposerId, stakeholderIds)];
  for (const chunk of chunkIds(sharedProposalIds)) {
    clauses.push(inArray(proposals.id, chunk));
  }
  return or(...clauses);
}

/**
 * Overlap windows for collision checks, built from the SAME calendar windows
 * (buildScheduleWindows) and widened for date-only kinds so conflict detection
 * matches the calendar (PC-318, replaces the old raw slot/resolved compare).
 *
 * Loads the flags buildScheduleWindows needs (all-day, batch sleeping,
 * recurrence, detached slots) plus the proposal type used for widening.
 */
export async function proposalConflictWindows(
  db: Db,
  proposal: ConflictWindowSource,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Promise<ConflictWindow[]> {
  const slots = await db
    .select({
      id: proposalTimeSlots.id,
      startAt: proposalTimeSlots.startAt,
      endAt: proposalTimeSlots.endAt,
      label: proposalTimeSlots.label,
      isDetached: proposalTimeSlots.isDetached,
    })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposal.id));

  return conflictWindowsFromSlots(proposal, slots, timeZone);
}

/** Proposal fields {@link conflictWindowsFromSlots} needs to shape its windows. */
export interface ConflictWindowSource {
  id: string;
  proposalType: string;
  isAllDay: boolean;
  isBatchSleeping: boolean;
  parentProposalId: string | null;
  isRecurrenceParent: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

/**
 * Window builder for callers that already batch-loaded slots (PC-355) — same
 * output as {@link proposalConflictWindows} without the per-proposal SELECT.
 */
export function conflictWindowsFromSlots(
  proposal: ConflictWindowSource,
  slots: Pick<ProposalSlotRow, "id" | "startAt" | "endAt" | "label" | "isDetached">[],
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ConflictWindow[] {
  const scheduled = proposal.scheduledStartAt
    ? { startAt: proposal.scheduledStartAt, endAt: proposal.scheduledEndAt }
    : null;

  return buildConflictWindows(
    {
      id: proposal.id,
      proposalType: proposal.proposalType,
      isAllDay: proposal.isAllDay,
      isBatchSleeping: proposal.isBatchSleeping,
      parentProposalId: proposal.parentProposalId,
      isRecurrenceParent: proposal.isRecurrenceParent,
    },
    slots.map((slot) => ({
      id: slot.id,
      startAt: slot.startAt,
      endAt: slot.endAt,
      label: slot.label,
      isDetached: slot.isDetached,
    })),
    scheduled,
    timeZone,
  );
}

/**
 * On resolve, auto-declines overlapping pending proposals into proposer review (PC-40).
 * Conflicting items revert to draft with at-risk flag and a system comment.
 */
export async function autoDeclineCollidingProposals(
  db: Db,
  resolved: typeof proposals.$inferSelect,
  scheduleStart: string | null,
  scheduleEnd: string | null,
  actorUserId: string,
): Promise<void> {
  if (!scheduleStart) return;

  // Build widened windows for the resolved item (parity with the calendar +
  // board conflict logic; handles batch nights and null sleeping ends) (PC-318).
  const resolvedWindows = await proposalConflictWindows(db, resolved);
  if (resolvedWindows.length === 0) return;

  const resolvedInvitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, resolved.id));
  const resolvedStakeholders = [
    ...new Set<string>([resolved.proposerId, ...resolvedInvitees.map((row) => row.userId)]),
  ];

  // Only proposals sharing a stakeholder can collide, so let SQL discard the
  // rest instead of loading every proposed row and every invitee (PC-355).
  const sharedProposalIds = await proposalIdsForInvitees(db, resolvedStakeholders);
  const pending = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.state, "proposed"),
        // Events never collide with sleeping arrangements (PC-59 parity).
        eq(proposals.proposalType, resolved.proposalType),
        ne(proposals.id, resolved.id),
        stakeholderReachFilter(resolvedStakeholders, sharedProposalIds),
      ),
    );
  if (pending.length === 0) return;

  const slotsByProposal = await loadSlotsByProposalIds(
    db,
    pending.map((row) => row.id),
  );

  const now = new Date().toISOString();
  const enforcement = await loadEnforcementSettings(db);
  const expiresAt = atRiskExpiresAtIso(enforcement);

  for (const other of pending) {
    const otherWindows = conflictWindowsFromSlots(other, slotsByProposal.get(other.id) ?? []);
    if (otherWindows.length === 0) continue;

    const overlaps = windowsConflict(
      resolved.proposalType,
      resolvedWindows,
      other.proposalType,
      otherWindows,
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
      { proposalId: other.id, resolvedProposalId: resolved.id, proposalType: other.proposalType },
    );
  }
}

/**
 * Detects bedroom/place occupancy conflicts for sleeping proposals (PC-40 MVP).
 */
export async function checkPlaceAssetConflicts(
  db: Db,
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

  // Same place + scheduled + date-bounded: the loop's own guards, pushed into
  // SQL so a network-wide sleeping history is never materialised (PC-355).
  const envelope = windowEnvelope(
    checkWindows.map((window) => ({ start: window.start, end: window.end })),
  );
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
        eq(proposals.locationId, proposal.locationId),
        isNotNull(proposals.scheduledStartAt),
        scheduledWithinEnvelope(envelope),
      ),
    );

  const warnings: ProposalConflictWarning[] = [];
  for (const other of sleepingActive) {
    if (other.id === excludeProposalId || other.id === proposal.id) continue;
    if (!other.scheduledStartAt) continue;

    const sameBedroom =
      proposal.bedroomIndex === null ||
      other.bedroomIndex === null ||
      proposal.bedroomIndex === other.bedroomIndex;
    if (!sameBedroom) continue;

    // Both sides are sleeping — widen the other night to its civil day so a
    // null/same-day end still overlaps the (already widened) check windows (PC-318).
    const otherWindow = widenConflictWindow(
      other.scheduledStartAt,
      other.scheduledEndAt,
      "sleeping",
      false,
    );

    for (const window of checkWindows) {
      if (
        intervalsOverlap(
          window.start,
          window.end,
          otherWindow.start,
          otherWindow.end,
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
 * Gathers stakeholder schedule overlaps for a proposal (shared by submit and admin fast-add).
 */
export async function gatherProposalConflictWarnings(
  db: Db,
  proposal: typeof proposals.$inferSelect,
  proposalId: string,
): Promise<ProposalConflictWarning[]> {
  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  // Same calendar windows the schedule renders, widened for date-only kinds (PC-318).
  const checkWindows = await proposalConflictWindows(db, proposal);

  if (checkWindows.length === 0) {
    return [];
  }

  const stakeholderIds = [
    ...new Set([proposal.proposerId, ...invitees.map((i) => i.userId)]),
  ];
  const warnings: ProposalConflictWarning[] = [];

  // Candidates are narrowed in SQL to same-type, scheduled, stakeholder-reachable
  // rows inside the padded window instead of every active proposal (PC-355).
  const sharedProposalIds = await proposalIdsForInvitees(db, stakeholderIds);
  const activeProposals = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      state: proposals.state,
      proposerId: proposals.proposerId,
      proposalType: proposals.proposalType,
      isAllDay: proposals.isAllDay,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
    })
    .from(proposals)
    .where(
      and(
        inArray(proposals.state, ["proposed", "resolved"]),
        // Sleeping arrangements do not schedule-conflict with events (PC-59).
        eq(proposals.proposalType, proposal.proposalType),
        ne(proposals.id, proposalId),
        isNotNull(proposals.scheduledStartAt),
        scheduledWithinEnvelope(windowEnvelope(checkWindows)),
        stakeholderReachFilter(stakeholderIds, sharedProposalIds),
      ),
    );

  const inviteesByProposal = new Map<string, string[]>();
  for (const chunk of chunkIds(activeProposals.map((row) => row.id))) {
    const rows = await db
      .select({
        proposalId: proposalInvitees.proposalId,
        userId: proposalInvitees.userId,
      })
      .from(proposalInvitees)
      .where(inArray(proposalInvitees.proposalId, chunk));
    for (const row of rows) {
      const list = inviteesByProposal.get(row.proposalId) ?? [];
      list.push(row.userId);
      inviteesByProposal.set(row.proposalId, list);
    }
  }

  // Warnings only ever name stakeholders of the proposal being checked.
  const nameById = new Map<string, string>();
  for (const chunk of chunkIds(stakeholderIds)) {
    const rows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, chunk));
    for (const row of rows) nameById.set(row.id, row.displayName);
  }

  for (const other of activeProposals) {
    if (!other.scheduledStartAt) continue;

    const otherStakeholders = new Set([
      other.proposerId,
      ...(inviteesByProposal.get(other.id) ?? []),
    ]);
    const affected = stakeholderIds.filter((id) => otherStakeholders.has(id));
    if (affected.length === 0) continue;

    // Widen the other side too so same-night sleeping (null end) and same-day
    // all-day (noon/noon) collide symmetrically with the current windows (PC-318).
    const otherWindow = widenConflictWindow(
      other.scheduledStartAt,
      other.scheduledEndAt,
      other.proposalType,
      other.isAllDay,
    );

    for (const window of checkWindows) {
      if (
        intervalsOverlap(
          window.start,
          window.end,
          otherWindow.start,
          otherWindow.end,
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

  return warnings;
}
