import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { notifyUser } from "@/lib/notifications";
import { expirePendingRecoveryProposals } from "@/lib/proposals/pending-recovery";
import {
  polyGroup,
  proposalInvitees,
  proposalStateLog,
  proposalTimeSlots,
  proposals,
} from "@/lib/db/schema";

export interface EnforcementSettings {
  /** Max hours in proposed before expiry; 0 = only expire when event start passes. */
  proposedMaxHours: number;
  atRiskTtlHours: number;
  archiveGraceHours: number;
  redraftDeadlineHours: number;
  /** Hours to hold calendar when required invitees drop to zero (PC-53). */
  recoveryMaxHours: number;
}

const DEFAULT_ENFORCEMENT: EnforcementSettings = {
  proposedMaxHours: 0,
  atRiskTtlHours: 168,
  archiveGraceHours: 24,
  redraftDeadlineHours: 24,
  recoveryMaxHours: 48,
};

type Db = ReturnType<typeof getDb>;

/**
 * Loads admin-configurable enforcement thresholds from poly group settings (PC-46).
 */
export async function loadEnforcementSettings(db: Db): Promise<EnforcementSettings> {
  const [row] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  if (!row) return DEFAULT_ENFORCEMENT;

  return {
    proposedMaxHours: row.proposedMaxHours ?? DEFAULT_ENFORCEMENT.proposedMaxHours,
    atRiskTtlHours: row.atRiskTtlHours ?? DEFAULT_ENFORCEMENT.atRiskTtlHours,
    archiveGraceHours: row.archiveGraceHours ?? DEFAULT_ENFORCEMENT.archiveGraceHours,
    redraftDeadlineHours: row.redraftDeadlineHours ?? DEFAULT_ENFORCEMENT.redraftDeadlineHours,
    recoveryMaxHours: row.recoveryMaxHours ?? DEFAULT_ENFORCEMENT.recoveryMaxHours,
  };
}

/** ISO timestamp for at-risk draft/archive TTL based on poly group settings. */
export function atRiskExpiresAtIso(settings: EnforcementSettings, fromMs = Date.now()): string {
  return new Date(fromMs + settings.atRiskTtlHours * 60 * 60 * 1000).toISOString();
}

/**
 * Computes at-risk expiry as the earlier of TTL-from-now or T-minus redraft deadline (PC-48).
 */
export function computeAtRiskExpiresAt(
  settings: EnforcementSettings,
  scheduledStartAt: string | null,
  fromMs = Date.now(),
): string {
  const ttlExpiryMs = fromMs + settings.atRiskTtlHours * 60 * 60 * 1000;
  if (!scheduledStartAt) {
    return new Date(ttlExpiryMs).toISOString();
  }
  const eventStartMs = new Date(scheduledStartAt).getTime();
  const beforeEventMs = eventStartMs - settings.redraftDeadlineHours * 60 * 60 * 1000;
  return new Date(Math.min(ttlExpiryMs, beforeEventMs)).toISOString();
}

async function logSystemTransition(
  db: Db,
  proposalId: string,
  action: string,
  details: string,
): Promise<void> {
  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId: null,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
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
    await logSystemTransition(
      db,
      proposal.id,
      "proposal.at_risk_expired",
      "At-risk TTL elapsed without resubmission.",
    );
  }
}

/**
 * Resolves the scheduling instant used for proposed expiration (slot start or scheduled start).
 */
async function getProposalEffectiveStart(db: Db, proposalId: string): Promise<string | null> {
  const [proposal] = await db
    .select({ scheduledStartAt: proposals.scheduledStartAt })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (proposal?.scheduledStartAt) return proposal.scheduledStartAt;

  const slots = await db
    .select({ startAt: proposalTimeSlots.startAt })
    .from(proposalTimeSlots)
    .where(eq(proposalTimeSlots.proposalId, proposalId))
    .orderBy(asc(proposalTimeSlots.startAt));

  return slots[0]?.startAt ?? null;
}

/**
 * Moves stale proposed items to draft when event start passes or max proposed hours elapse (PC-46).
 */
async function expireProposedProposals(db: Db, settings: EnforcementSettings): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const proposedRows = await db.select().from(proposals).where(eq(proposals.state, "proposed"));

  for (const proposal of proposedRows) {
    const effectiveStart = await getProposalEffectiveStart(db, proposal.id);
    const startPassed = Boolean(effectiveStart && effectiveStart <= nowIso);

    const maxHoursExpired =
      settings.proposedMaxHours > 0 &&
      now.getTime() - new Date(proposal.updatedAt).getTime() >
        settings.proposedMaxHours * 60 * 60 * 1000;

    if (!startPassed && !maxHoursExpired) continue;

    await db
      .update(proposals)
      .set({ state: "draft", atRisk: false, atRiskExpiresAt: null, updatedAt: nowIso })
      .where(eq(proposals.id, proposal.id));

    await resetInviteeVotes(db, proposal.id);

    const reason = startPassed
      ? "Event start passed without full approval — returned to draft."
      : `Proposed longer than ${settings.proposedMaxHours}h without resolution — returned to draft.`;

    await logSystemTransition(db, proposal.id, "proposal.proposed_expired", reason);

    await notifyUser(
      proposal.proposerId,
      "proposal_expired",
      `Proposal "${proposal.title}" expired and was moved to your drafts.`,
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
  const resolvedRows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, "resolved"), eq(proposals.isRecurrenceParent, false)));

  for (const proposal of resolvedRows) {
    const endAt = proposal.scheduledEndAt ?? proposal.scheduledStartAt;
    if (!endAt) continue;
    if (now.getTime() < new Date(endAt).getTime() + graceMs) continue;

    const nowIso = now.toISOString();
    await db
      .update(proposals)
      .set({ state: "archived", atRisk: false, atRiskExpiresAt: null, updatedAt: nowIso })
      .where(eq(proposals.id, proposal.id));

    await logSystemTransition(
      db,
      proposal.id,
      "proposal.auto_archived",
      `Archived ${settings.archiveGraceHours}h after scheduled end.`,
    );
  }
}

/**
 * Auto-transitions at-risk resolved proposals within the redraft deadline back to proposed (PC-45/46).
 */
async function processRedraftDeadlines(db: Db, settings: EnforcementSettings): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const deadlineMs = now.getTime() + settings.redraftDeadlineHours * 60 * 60 * 1000;

  const candidates = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, "resolved"), eq(proposals.atRisk, true)));

  for (const proposal of candidates) {
    if (!proposal.scheduledStartAt) continue;
    const startMs = new Date(proposal.scheduledStartAt).getTime();
    if (startMs > deadlineMs) continue;

    await db
      .update(proposals)
      .set({ state: "proposed", updatedAt: nowIso })
      .where(eq(proposals.id, proposal.id));

    await resetInviteeVotes(db, proposal.id);
    await logSystemTransition(
      db,
      proposal.id,
      "proposal.redraft_deadline",
      `Within ${settings.redraftDeadlineHours}h of start — returned to proposed for re-approval.`,
    );

    const invitees = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, proposal.id));

    const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
    for (const userId of notifyIds) {
      await notifyUser(
        userId,
        "proposal_redraft_deadline",
        `Proposal "${proposal.title}" needs re-approval before it starts.`,
        { proposalId: proposal.id, action: "vote" },
      );
    }
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

  for (const parent of parents) {
    const children = await db
      .select({
        id: proposals.id,
        state: proposals.state,
        scheduledEndAt: proposals.scheduledEndAt,
        scheduledStartAt: proposals.scheduledStartAt,
      })
      .from(proposals)
      .where(eq(proposals.parentProposalId, parent.id))
      .orderBy(desc(proposals.occurrenceIndex));

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
      await logSystemTransition(
        db,
        id,
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
    .where(and(eq(proposals.state, "resolved"), eq(proposals.atRisk, true)));

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

    await logSystemTransition(
      db,
      proposal.id,
      "proposal.at_risk_auto_cancelled",
      "At-risk event auto-cancelled after TTL or event start without resolution.",
    );

    const invitees = await db
      .select({ userId: proposalInvitees.userId })
      .from(proposalInvitees)
      .where(eq(proposalInvitees.proposalId, proposal.id));

    const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
    for (const userId of notifyIds) {
      await notifyUser(
        userId,
        "proposal_at_risk_cancelled",
        `Proposal "${proposal.title}" was auto-cancelled because at-risk status was not resolved.`,
        { proposalId: proposal.id },
      );
    }
  }
}

/**
 * Runs all proposal enforcement jobs (call on board load, detail fetch, and cron) (PC-46/48).
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
}

/** Returns true when two ISO intervals overlap (open end uses start as instant). */
export function intervalsOverlap(
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
 * Detects in-flight calendar overlap for a voter who already responded (PC-46).
 */
export async function detectViewerOverlapWarning(
  db: Db,
  proposalId: string,
  viewerId: string,
  viewerVoteStatus: string | null | undefined,
  overlapAcknowledgedAt: string | null | undefined,
  scheduledStartAt: string | null,
  scheduledEndAt: string | null,
): Promise<boolean> {
  if (
    !scheduledStartAt ||
    !viewerVoteStatus ||
    viewerVoteStatus === "not_seen" ||
    overlapAcknowledgedAt
  ) {
    return false;
  }

  const activeProposals = await db
    .select({
      id: proposals.id,
      scheduledStartAt: proposals.scheduledStartAt,
      scheduledEndAt: proposals.scheduledEndAt,
      proposerId: proposals.proposerId,
    })
    .from(proposals)
    .where(inArray(proposals.state, ["proposed", "resolved"]));

  const activeInvitees = await db
    .select({ proposalId: proposalInvitees.proposalId, userId: proposalInvitees.userId })
    .from(proposalInvitees);

  const inviteesByProposal = new Map<string, string[]>();
  for (const row of activeInvitees) {
    const list = inviteesByProposal.get(row.proposalId) ?? [];
    list.push(row.userId);
    inviteesByProposal.set(row.proposalId, list);
  }

  for (const other of activeProposals) {
    if (other.id === proposalId || !other.scheduledStartAt) continue;
    const stakeholders = new Set([other.proposerId, ...(inviteesByProposal.get(other.id) ?? [])]);
    if (!stakeholders.has(viewerId)) continue;

    if (
      intervalsOverlap(
        scheduledStartAt,
        scheduledEndAt,
        other.scheduledStartAt,
        other.scheduledEndAt,
      )
    ) {
      return true;
    }
  }

  return false;
}
