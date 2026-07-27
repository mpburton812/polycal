import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { notifyUser } from "@/lib/notifications";
import {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";
import { expirePendingRecoveryProposals } from "@/lib/proposals/pending-recovery";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { notifyProposalParticipants } from "@/lib/proposals/services/notify-participants";
import { chunkIds, loadSlotsByProposalIds } from "@/lib/proposals/services/slot-loader";
import { sleepingCalendarDayEnd } from "@/lib/proposals/sleeping-schedule";
import { widenConflictWindow } from "@/lib/proposals/conflict-windows";
import { intervalsOverlap } from "@/lib/schedule/dates";
import { loadNetworkSettings } from "@/lib/networks/settings";
import {
  polyGroup,
  proposalInvitees,
  proposalTimeSlots,
  proposals,
  sleepingPartnerships,
  users,
  type ProposalType,
} from "@/lib/db/schema";

export interface EnforcementSettings {
  /** Max days in proposed before expiry; 0 = only expire when event start passes. */
  proposedMaxDays: number;
  atRiskTtlDays: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  /** Days before unanswered sleeping-partner proposals are deleted. */
  sleepingPartnerProposalMaxDays: number;
}

const DEFAULT_ENFORCEMENT: EnforcementSettings = {
  proposedMaxDays: 0,
  atRiskTtlDays: 7,
  archiveGraceHours: 24,
  redraftDeadlineHours: 24,
  sleepingPartnerProposalMaxDays: 5,
};

type Db = ReturnType<typeof getDb>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Slack on SQL date prefilters for sweeps whose exact cutoff is computed in JS
 * (sleeping rows expire at civil-day end, up to a day past their stored
 * timestamp). The precise comparison still runs per row (PC-355).
 */
const SWEEP_PREFILTER_PAD_MS = 2 * MS_PER_DAY;

function shiftIso(iso: string, deltaMs: number): string {
  return new Date(Date.parse(iso) + deltaMs).toISOString();
}

/**
 * Loads admin-configurable enforcement thresholds from poly group settings (PC-46 / PC-273).
 */
export async function loadEnforcementSettings(
  db: Db,
  networkId?: string,
): Promise<EnforcementSettings> {
  if (networkId) {
    const settings = await loadNetworkSettings(networkId, db);
    if (!settings) return DEFAULT_ENFORCEMENT;
    return {
      proposedMaxDays: settings.proposedMaxDays,
      atRiskTtlDays: settings.atRiskTtlDays,
      archiveGraceHours: settings.archiveGraceHours,
      redraftDeadlineHours: settings.redraftDeadlineHours,
      sleepingPartnerProposalMaxDays: settings.sleepingPartnerProposalMaxDays,
    };
  }
  const [row] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  if (!row) return DEFAULT_ENFORCEMENT;

  return {
    proposedMaxDays: row.proposedMaxDays ?? DEFAULT_ENFORCEMENT.proposedMaxDays,
    atRiskTtlDays: row.atRiskTtlDays ?? DEFAULT_ENFORCEMENT.atRiskTtlDays,
    archiveGraceHours: row.archiveGraceHours ?? DEFAULT_ENFORCEMENT.archiveGraceHours,
    redraftDeadlineHours: row.redraftDeadlineHours ?? DEFAULT_ENFORCEMENT.redraftDeadlineHours,
    sleepingPartnerProposalMaxDays:
      row.sleepingPartnerProposalMaxDays ?? DEFAULT_ENFORCEMENT.sleepingPartnerProposalMaxDays,
  };
}

/** ISO timestamp for at-risk draft/archive TTL based on poly group settings. */
export function atRiskExpiresAtIso(settings: EnforcementSettings, fromMs = Date.now()): string {
  return new Date(fromMs + settings.atRiskTtlDays * MS_PER_DAY).toISOString();
}

/**
 * Computes at-risk expiry as the earlier of TTL-from-now or T-minus redraft deadline (PC-48).
 * When the event start (or T-minus deadline) is already in the past, use the full TTL so a
 * mid-series redraft is not immediately archived by enforcement.
 */
export function computeAtRiskExpiresAt(
  settings: EnforcementSettings,
  scheduledStartAt: string | null,
  fromMs = Date.now(),
): string {
  const ttlExpiryMs = fromMs + settings.atRiskTtlDays * MS_PER_DAY;
  if (!scheduledStartAt) {
    return new Date(ttlExpiryMs).toISOString();
  }
  const eventStartMs = new Date(scheduledStartAt).getTime();
  const beforeEventMs = eventStartMs - settings.redraftDeadlineHours * 60 * 60 * 1000;
  if (beforeEventMs <= fromMs) {
    return new Date(ttlExpiryMs).toISOString();
  }
  return new Date(Math.min(ttlExpiryMs, beforeEventMs)).toISOString();
}

async function resetInviteeVotes(db: Db, proposalId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ voteStatus: "not_seen", respondedAt: null, overlapAcknowledgedAt: null })
    .where(eq(proposalInvitees.proposalId, proposalId));
}

/**
 * Archives at-risk drafts whose TTL expired without resubmission (PC-40 / PC-46).
 */
async function expireAtRiskProposals(db: Db): Promise<void> {
  const now = new Date().toISOString();
  const expired = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.state, "draft"),
        eq(proposals.atRisk, true),
        // TTL comparison pushed into SQL — drafts still counting down never load.
        isNotNull(proposals.atRiskExpiresAt),
        lte(proposals.atRiskExpiresAt, now),
      ),
    );

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

type ProposalScheduleRow = {
  id: string;
  proposalType: string;
  isBatchSleeping: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
};

/**
 * Schedule-based proposed expiry instant from preloaded slot starts (PC-292 / PC-46 / PC-282).
 * Batch sleeping uses the latest night; sleeping nights expire at calendar day-end.
 */
export function computeScheduleExpirationInstant(
  proposal: ProposalScheduleRow,
  slotStartAts: string[],
): string | null {
  let anchor: string | null = null;
  if (proposal.isBatchSleeping) {
    anchor =
      slotStartAts[slotStartAts.length - 1] ??
      proposal.scheduledEndAt ??
      proposal.scheduledStartAt;
  } else if (proposal.scheduledStartAt) {
    anchor = proposal.scheduledStartAt;
  } else {
    anchor = slotStartAts[0] ?? null;
  }

  if (!anchor) return null;
  if (proposal.proposalType === "sleeping") {
    return sleepingCalendarDayEnd(anchor).toISOString();
  }
  return anchor;
}

/**
 * Wall-clock when a proposed item would expire under enforcement (PC-292).
 * Earlier of schedule instant and updatedAt + proposedMaxDays when max days > 0.
 */
export function computeProposedExpiresAt(
  scheduleInstant: string | null,
  updatedAt: string,
  proposedMaxDays: number,
): string | null {
  const candidates: number[] = [];
  if (scheduleInstant) {
    const scheduleMs = Date.parse(scheduleInstant);
    if (!Number.isNaN(scheduleMs)) candidates.push(scheduleMs);
  }
  if (proposedMaxDays > 0) {
    const updatedMs = Date.parse(updatedAt);
    if (!Number.isNaN(updatedMs)) {
      candidates.push(updatedMs + proposedMaxDays * MS_PER_DAY);
    }
  }
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates)).toISOString();
}

/**
 * Resolves when a proposed item is treated as "past start" for expiry (PC-46 / PC-282).
 * Batch sleeping uses the latest night so earlier nights can still be voted on.
 * Sleeping nights expire at calendar day-end (parity with archive / board past).
 */
export async function getProposedExpirationInstant(
  db: Db,
  proposal: ProposalScheduleRow,
): Promise<string | null> {
  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposal.id))
    .orderBy(asc(proposalTimeSlots.startAt));

  return computeScheduleExpirationInstant(
    proposal,
    slots.map((slot) => slot.startAt),
  );
}

/**
 * Resolved archive grace runs after the scheduled window ends.
 * Single-night sleeping uses end-of-calendar-day because scheduledEndAt is null.
 */
export function resolveResolvedArchiveEndAt(proposal: ProposalScheduleRow): Date | null {
  const { scheduledStartAt, scheduledEndAt, proposalType } = proposal;
  if (!scheduledStartAt) return null;

  if (proposalType === "sleeping") {
    const anchor = scheduledEndAt ?? scheduledStartAt;
    return sleepingCalendarDayEnd(anchor);
  }

  return new Date(scheduledEndAt ?? scheduledStartAt);
}

/**
 * Moves stale proposed items to draft when event start passes or max proposed hours elapse (PC-46).
 */
async function expireProposedProposals(db: Db, settings: EnforcementSettings): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const proposedRows = await db.select().from(proposals).where(eq(proposals.state, "proposed"));
  if (proposedRows.length === 0) return;

  // One slot query for the whole sweep instead of one per proposed row (PC-355).
  const slotsByProposal = await loadSlotsByProposalIds(
    db,
    proposedRows.map((row) => row.id),
  );

  for (const proposal of proposedRows) {
    const expirationInstant = computeScheduleExpirationInstant(
      proposal,
      (slotsByProposal.get(proposal.id) ?? []).map((slot) => slot.startAt),
    );
    const startPassed = Boolean(expirationInstant && expirationInstant <= nowIso);

    const maxDaysExpired =
      settings.proposedMaxDays > 0 &&
      now.getTime() - new Date(proposal.updatedAt).getTime() >
        settings.proposedMaxDays * MS_PER_DAY;

    if (!startPassed && !maxDaysExpired) continue;

    await db
      .update(proposals)
      .set({ state: "draft", atRisk: false, atRiskExpiresAt: null, updatedAt: nowIso })
      .where(eq(proposals.id, proposal.id));

    await resetInviteeVotes(db, proposal.id);

    const reason = startPassed
      ? "Event start passed without full approval — returned to draft."
      : `Proposed longer than ${settings.proposedMaxDays}d without resolution — returned to draft.`;

    await logProposalTransition(db, proposal.id, null, "proposal.proposed_expired", reason);

    await dismissAllNotificationsForProposal(proposal.id);
    await notifyUser(
      proposal.proposerId,
      "proposal_expired",
      formatDraftReturnNotification(proposal.title, reason),
      { proposalId: proposal.id, action: "edit" },
    );
  }
}

/**
 * Archives resolved events after the configured grace period past end time (PC-46).
 */
async function archivePastResolvedProposals(db: Db, settings: EnforcementSettings): Promise<void> {
  const now = new Date();
  const graceMs = settings.archiveGraceHours * 60 * 60 * 1000;
  // Archive can only fire once the scheduled end + grace has passed; bound the
  // scan to that (padded) cutoff and keep the exact check per row (PC-355).
  const paddedCutoff = new Date(
    now.getTime() - graceMs + SWEEP_PREFILTER_PAD_MS,
  ).toISOString();
  const resolvedRows = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.state, "resolved"),
        eq(proposals.isRecurrenceParent, false),
        isNotNull(proposals.scheduledStartAt),
        or(
          lte(proposals.scheduledEndAt, paddedCutoff),
          and(
            isNull(proposals.scheduledEndAt),
            lte(proposals.scheduledStartAt, paddedCutoff),
          ),
        ),
      ),
    );

  for (const proposal of resolvedRows) {
    const archiveEndAt = resolveResolvedArchiveEndAt(proposal);
    if (!archiveEndAt) continue;
    if (now.getTime() < archiveEndAt.getTime() + graceMs) continue;

    const nowIso = now.toISOString();
    await db
      .update(proposals)
      .set({ state: "archived", atRisk: false, atRiskExpiresAt: null, updatedAt: nowIso })
      .where(eq(proposals.id, proposal.id));

    await logProposalTransition(
      db,
      proposal.id,
      null,
      "proposal.auto_archived",
      `Archived ${settings.archiveGraceHours}h after scheduled end.`,
    );

    const { scheduleCalendarSync } = await import("@/lib/calendar/sync");
    await scheduleCalendarSync(proposal.id, "delete");
  }
}

/**
 * Auto-transitions at-risk resolved proposals within the redraft deadline back to proposed (PC-45/46).
 */
async function processRedraftDeadlines(db: Db, settings: EnforcementSettings): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const deadlineMs = now.getTime() + settings.redraftDeadlineHours * 60 * 60 * 1000;
  const deadlineIso = new Date(deadlineMs).toISOString();

  const candidates = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.state, "resolved"),
        eq(proposals.atRisk, true),
        // Only starts inside the redraft window can transition (PC-355).
        isNotNull(proposals.scheduledStartAt),
        lte(proposals.scheduledStartAt, deadlineIso),
      ),
    );

  for (const proposal of candidates) {
    if (!proposal.scheduledStartAt) continue;
    const startMs = new Date(proposal.scheduledStartAt).getTime();
    if (startMs > deadlineMs) continue;

    await db
      .update(proposals)
      .set({ state: "proposed", updatedAt: nowIso })
      .where(eq(proposals.id, proposal.id));

    await resetInviteeVotes(db, proposal.id);
    await logProposalTransition(
      db,
      proposal.id,
      null,
      "proposal.redraft_deadline",
      `Within ${settings.redraftDeadlineHours}h of start — returned to proposed for re-approval.`,
    );

    await notifyProposalParticipants(db, {
      proposalId: proposal.id,
      proposerId: proposal.proposerId,
      notificationType: "proposal_redraft_deadline",
      message: `Proposal "${proposal.title}" needs re-approval before it starts.`,
      metadata: { action: "vote" },
    });
  }
}

/**
 * Archives recurring series parents after the final child occurrence end date (PC-48 / spec §11).
 */
async function archiveExpiredRecurrenceSeries(db: Db, settings: EnforcementSettings): Promise<void> {
  const now = new Date();
  const graceMs = settings.archiveGraceHours * 60 * 60 * 1000;
  const parents = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, "resolved"), eq(proposals.isRecurrenceParent, true)));
  if (parents.length === 0) return;

  // Children for every parent in one pass instead of a query per series (PC-355).
  const childrenByParent = new Map<
    string,
    { id: string; state: string; scheduledEndAt: string | null; scheduledStartAt: string | null }[]
  >();
  for (const chunk of chunkIds(parents.map((parent) => parent.id))) {
    const rows = await db
      .select({
        id: proposals.id,
        parentProposalId: proposals.parentProposalId,
        state: proposals.state,
        scheduledEndAt: proposals.scheduledEndAt,
        scheduledStartAt: proposals.scheduledStartAt,
      })
      .from(proposals)
      .where(inArray(proposals.parentProposalId, chunk))
      .orderBy(desc(proposals.occurrenceIndex));
    for (const row of rows) {
      if (!row.parentProposalId) continue;
      const list = childrenByParent.get(row.parentProposalId) ?? [];
      list.push(row);
      childrenByParent.set(row.parentProposalId, list);
    }
  }

  for (const parent of parents) {
    const children = childrenByParent.get(parent.id) ?? [];

    if (children.length === 0) continue;

    let finalEndMs = 0;
    for (const child of children) {
      const endAt = child.scheduledEndAt ?? child.scheduledStartAt;
      if (!endAt) continue;
      finalEndMs = Math.max(finalEndMs, new Date(endAt).getTime());
    }
    if (finalEndMs === 0 || now.getTime() <= finalEndMs + graceMs) continue;

    const nowIso = now.toISOString();
    const idsToArchive = [parent.id, ...children.filter((c) => c.state === "resolved").map((c) => c.id)];

    for (const id of idsToArchive) {
      await db
        .update(proposals)
        .set({ state: "archived", atRisk: false, atRiskExpiresAt: null, updatedAt: nowIso })
        .where(eq(proposals.id, id));
      await logProposalTransition(
        db,
        id,
        null,
        "proposal.recurrence_series_archived",
        "Recurring series archived after final occurrence end.",
      );
    }
  }
}

/**
 * Auto-cancels unresolved at-risk resolved events past expiry or event start (PC-48 / spec §9).
 */
async function autoCancelUnresolvedAtRiskResolved(db: Db): Promise<void> {
  const nowIso = new Date().toISOString();
  const atRiskResolved = await db
    .select()
    .from(proposals)
    .where(
      and(
        eq(proposals.state, "resolved"),
        eq(proposals.atRisk, true),
        // Either trigger (TTL elapsed or start passed) must already be true.
        or(
          lte(proposals.atRiskExpiresAt, nowIso),
          lte(proposals.scheduledStartAt, nowIso),
        ),
      ),
    );

  for (const proposal of atRiskResolved) {
    const expiredByTtl = Boolean(proposal.atRiskExpiresAt && proposal.atRiskExpiresAt <= nowIso);
    const eventStarted = Boolean(
      proposal.scheduledStartAt && proposal.scheduledStartAt <= nowIso,
    );
    if (!expiredByTtl && !eventStarted) continue;

    await db
      .update(proposals)
      .set({
        state: "archived",
        atRisk: false,
        atRiskExpiresAt: null,
        scheduledStartAt: null,
        scheduledEndAt: null,
        updatedAt: nowIso,
      })
      .where(eq(proposals.id, proposal.id));

    await logProposalTransition(
      db,
      proposal.id,
      null,
      "proposal.at_risk_auto_cancelled",
      "At-risk event auto-cancelled after TTL or event start without resolution.",
    );

    await notifyProposalParticipants(db, {
      proposalId: proposal.id,
      proposerId: proposal.proposerId,
      notificationType: "proposal_at_risk_cancelled",
      message: `Proposal "${proposal.title}" was auto-cancelled because at-risk status was not resolved.`,
    });
  }
}

/**
 * Deletes unanswered sleeping-partner proposals past the configured day TTL
 * and notifies both parties (PC-273).
 */
async function expireSleepingPartnerProposals(
  db: Db,
  settings: EnforcementSettings,
): Promise<void> {
  const cutoffMs = Date.now() - settings.sleepingPartnerProposalMaxDays * MS_PER_DAY;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const pending = await db
    .select()
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.status, "proposed"),
        // updatedAt is NOT NULL and tracks the last response attempt (PC-355).
        lte(sleepingPartnerships.updatedAt, cutoffIso),
      ),
    );

  for (const row of pending) {
    const proposedAt = row.updatedAt || row.createdAt;
    if (proposedAt > cutoffIso) continue;

    const partnerIds = [row.userLowId, row.userHighId];
    const nameRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, partnerIds));
    const names = new Map(nameRows.map((n) => [n.id, n.displayName]));
    const proposerName = names.get(row.proposedById) ?? "Someone";
    const inviteeId =
      row.proposedById === row.userLowId ? row.userHighId : row.userLowId;
    const inviteeName = names.get(inviteeId) ?? "your partner";

    await db.delete(sleepingPartnerships).where(eq(sleepingPartnerships.id, row.id));

    const message = `The sleeping partnership proposal between ${proposerName} and ${inviteeName} expired after ${settings.sleepingPartnerProposalMaxDays} day(s) without a response and was removed.`;
    for (const userId of partnerIds) {
      await notifyUser(userId, "partnership_expired", message, {
        partnershipId: row.id,
        proposerId: row.proposedById,
        partnerId: inviteeId,
      });
    }
  }
}

/**
 * Runs all proposal enforcement jobs (call on board load, detail fetch, and cron) (PC-46/48/273).
 */
export async function runProposalEnforcement(db: Db): Promise<void> {
  const settings = await loadEnforcementSettings(db);
  await expirePendingRecoveryProposals(db);
  await expireAtRiskProposals(db);
  await expireProposedProposals(db, settings);
  await archivePastResolvedProposals(db, settings);
  await archiveExpiredRecurrenceSeries(db, settings);
  await processRedraftDeadlines(db, settings);
  await autoCancelUnresolvedAtRiskResolved(db);
  await expireSleepingPartnerProposals(db, settings);
}

/** Re-export the single source-of-truth interval overlap check (PC-318). */
export { intervalsOverlap };

/**
 * Detects in-flight calendar overlap for a voter who already responded (PC-46).
 *
 * Windows are widened to whole-day bounds for sleeping/all-day kinds and only
 * same-type pairs are compared so events never collide with sleeping (PC-59),
 * matching the board conflict + calendar overlap logic (PC-318).
 */
export async function detectViewerOverlapWarning(
  db: Db,
  proposalId: string,
  viewerId: string,
  viewerVoteStatus: string | null | undefined,
  overlapAcknowledgedAt: string | null | undefined,
  scheduledStartAt: string | null,
  scheduledEndAt: string | null,
  proposalType: string = "event",
  isAllDay: boolean = false,
): Promise<boolean> {
  if (
    !scheduledStartAt ||
    !viewerVoteStatus ||
    viewerVoteStatus === "not_seen" ||
    overlapAcknowledgedAt
  ) {
    return false;
  }

  const viewerWindow = widenConflictWindow(
    scheduledStartAt,
    scheduledEndAt,
    proposalType,
    isAllDay,
  );

  // Only the viewer's own calendar can overlap, so scope the scan to proposals
  // they propose or are invited to, within the padded window (PC-355).
  const viewerInviteeRows = await db
    .select({ proposalId: proposalInvitees.proposalId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.userId, viewerId));
  const viewerProposalIds = [...new Set(viewerInviteeRows.map((row) => row.proposalId))];

  const paddedStart = shiftIso(viewerWindow.start, -SWEEP_PREFILTER_PAD_MS);
  const paddedEnd = shiftIso(
    viewerWindow.end ?? viewerWindow.start,
    SWEEP_PREFILTER_PAD_MS,
  );

  const reachClauses = [eq(proposals.proposerId, viewerId)];
  for (const chunk of chunkIds(viewerProposalIds)) {
    reachClauses.push(inArray(proposals.id, chunk));
  }

  const activeProposals = await db
    .select({
      id: proposals.id,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      proposerId: proposals.proposerId,
      proposalType: proposals.proposalType,
      isAllDay: proposals.isAllDay,
    })
    .from(proposals)
    .where(
      and(
        inArray(proposals.state, ["proposed", "resolved"]),
        // Sleeping arrangements never conflict with events (PC-59).
        eq(proposals.proposalType, proposalType as ProposalType),
        isNotNull(proposals.scheduledStartAt),
        lte(proposals.scheduledStartAt, paddedEnd),
        or(
          gte(proposals.scheduledEndAt, paddedStart),
          and(
            isNull(proposals.scheduledEndAt),
            gte(proposals.scheduledStartAt, paddedStart),
          ),
        ),
        or(...reachClauses),
      ),
    );

  for (const other of activeProposals) {
    if (other.id === proposalId || !other.scheduledStartAt) continue;

    const otherWindow = widenConflictWindow(
      other.scheduledStartAt,
      other.scheduledEndAt,
      other.proposalType,
      other.isAllDay,
    );

    if (
      intervalsOverlap(
        viewerWindow.start,
        viewerWindow.end,
        otherWindow.start,
        otherWindow.end,
      )
    ) {
      return true;
    }
  }

  return false;
}
