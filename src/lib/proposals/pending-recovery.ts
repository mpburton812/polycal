import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { notifyUser } from "@/lib/notifications";
import {
  loadEnforcementSettings,
  type EnforcementSettings,
} from "@/lib/proposals/enforcement";
import { proposalInvitees, proposalStateLog, proposals } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

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

function recoveryExpiresAt(settings: EnforcementSettings, fromMs = Date.now()): string {
  return new Date(fromMs + settings.recoveryMaxHours * 60 * 60 * 1000).toISOString();
}

/**
 * When a resolved proposal loses all required invitees and is not intentional solo,
 * hold the calendar block until recovery TTL elapses (PC-53).
 */
export async function enterPendingRecoveryIfNeeded(
  db: Db,
  proposalId: string,
  reason: string,
): Promise<"recovery" | "draft" | "none"> {
  const [proposal] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal || proposal.intentionalSolo) return "none";

  const remainingRequired = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(
      and(eq(proposalInvitees.proposalId, proposalId), eq(proposalInvitees.role, "required")),
    );

  if (remainingRequired.length > 0) return "none";

  const now = new Date().toISOString();
  const settings = await loadEnforcementSettings(db);

  if (proposal.state === "resolved" && proposal.scheduledStartAt) {
    const until = recoveryExpiresAt(settings);
    await db
      .update(proposals)
      .set({
        pendingRecoveryUntil: until,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposalId));

    await logSystemTransition(
      db,
      proposalId,
      "proposal.pending_recovery",
      `${reason} Recovery TTL until ${until}.`,
    );

    await notifyUser(
      proposal.proposerId,
      "proposal_missing_invitees",
      `Proposal "${proposal.title}" needs invitees or solo confirmation before ${new Date(until).toLocaleString()}.`,
      { proposalId },
    );
    return "recovery";
  }

  const noteLine = `Missing invitees: ${reason}`;
  await db
    .update(proposals)
    .set({
      state: "draft",
      atRisk: false,
      pendingRecoveryUntil: null,
      scheduledStartAt: null,
      scheduledEndAt: null,
      notes: proposal.notes?.trim() ? `${proposal.notes.trim()}\n${noteLine}` : noteLine,
      updatedAt: now,
    })
    .where(eq(proposals.id, proposalId));

  await logSystemTransition(db, proposalId, "proposal.reverted_to_draft", noteLine);

  const invitees = await db
    .select({ userId: proposalInvitees.userId })
    .from(proposalInvitees)
    .where(eq(proposalInvitees.proposalId, proposalId));

  const notifyIds = new Set<string>([proposal.proposerId, ...invitees.map((row) => row.userId)]);
  for (const notifyId of notifyIds) {
    await notifyUser(
      notifyId,
      "proposal_reverted_to_draft",
      `Proposal "${proposal.title}" was moved back to drafts.`,
      { proposalId, reason },
    );
  }
  return "draft";
}

/**
 * Expires pending-recovery holds — clears calendar and returns proposal to drafts (PC-53).
 */
export async function expirePendingRecoveryProposals(db: Db): Promise<void> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, "resolved")));

  for (const proposal of rows) {
    if (!proposal.pendingRecoveryUntil || proposal.pendingRecoveryUntil > now) continue;

    const noteLine = "Missing invitees: recovery TTL elapsed.";
    await db
      .update(proposals)
      .set({
        state: "draft",
        pendingRecoveryUntil: null,
        scheduledStartAt: null,
        scheduledEndAt: null,
        atRisk: false,
        notes: proposal.notes?.trim() ? `${proposal.notes.trim()}\n${noteLine}` : noteLine,
        updatedAt: now,
      })
      .where(eq(proposals.id, proposal.id));

    await logSystemTransition(db, proposal.id, "proposal.recovery_expired", noteLine);

    await notifyUser(
      proposal.proposerId,
      "proposal_missing_invitees",
      `Proposal "${proposal.title}" was returned to drafts — add invitees or mark solo.`,
      { proposalId: proposal.id },
    );
  }
}
