/**
 * Proposal schedule/asset conflict detection and collision resolution (PC-328).
 *
 * Carved out of `src/actions/proposals/_core.ts` (Epic 4 core carve) without
 * behavior changes: the same widened calendar windows (`buildScheduleWindows`
 * via {@link buildConflictWindows}) drive both the pre-submit warnings and the
 * on-resolve auto-decline sweep, preserving the PC-59/PC-318 conflict contract.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";

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

/**
 * Overlap windows for collision checks, built from the SAME calendar windows
 * (buildScheduleWindows) and widened for date-only kinds so conflict detection
 * matches the calendar (PC-318, replaces the old raw slot/resolved compare).
 *
 * Loads the flags buildScheduleWindows needs (all-day, batch sleeping,
 * recurrence, detached slots) plus the proposal type used for widening.
 */
export async function proposalConflictWindows(
  db: ReturnType<typeof getDb>,
  proposal: {
    id: string;
    proposalType: string;
    isAllDay: boolean;
    isBatchSleeping: boolean;
    parentProposalId: string | null;
    isRecurrenceParent: boolean;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
  },
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
  db: ReturnType<typeof getDb>,
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
    // Events never collide with sleeping arrangements (PC-59 parity).
    if (other.proposalType !== resolved.proposalType) continue;

    const otherStakeholders = new Set<string>([
      other.proposerId,
      ...(inviteesByProposal.get(other.id) ?? []),
    ]);
    const sharesStakeholder = [...resolvedStakeholders].some((id) =>
      otherStakeholders.has(id),
    );
    if (!sharesStakeholder) continue;

    const otherWindows = await proposalConflictWindows(db, other);
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
  db: ReturnType<typeof getDb>,
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

  const stakeholderIds = new Set([proposal.proposerId, ...invitees.map((i) => i.userId)]);
  const warnings: ProposalConflictWarning[] = [];

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
    // Sleeping arrangements do not schedule-conflict with events (PC-59).
    if (proposal.proposalType !== other.proposalType) continue;

    const otherStakeholders = new Set([
      other.proposerId,
      ...(inviteesByProposal.get(other.id) ?? []),
    ]);
    const affected = [...stakeholderIds].filter((id) => otherStakeholders.has(id));
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
