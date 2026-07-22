import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { notifyUser } from "@/lib/notifications";
import {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";
import { logProposalTransition } from "@/lib/proposals/services/state-log";
import { notifyProposalParticipants } from "@/lib/proposals/services/notify-participants";
import { proposalInvitees, proposals } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * When a proposal loses all required invitees and is not intentional solo,
 * clear the calendar and return it to drafts immediately (PC-273 — recovery hold removed).
 */
export async function enterPendingRecoveryIfNeeded(
  db: Db,
  proposalId: string,
  reason: string,
): Promise<"draft" | "none"> {
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

  await logProposalTransition(db, proposalId, null, "proposal.reverted_to_draft", noteLine);

  await dismissAllNotificationsForProposal(proposalId);
  await notifyProposalParticipants(db, {
    proposalId,
    proposerId: proposal.proposerId,
    notificationType: "proposal_reverted_to_draft",
    message: formatDraftReturnNotification(proposal.title, reason),
    metadata: { reason },
  });
  return "draft";
}

/**
 * Clears any legacy pending-recovery holds left from before PC-273 (returns to drafts).
 */
export async function expirePendingRecoveryProposals(db: Db): Promise<void> {
  const now = new Date().toISOString();
  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.state, "resolved")));

  for (const proposal of rows) {
    if (!proposal.pendingRecoveryUntil) continue;

    const noteLine = "Missing invitees: legacy recovery hold cleared.";
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

    await logProposalTransition(db, proposal.id, null, "proposal.recovery_expired", noteLine);

    await notifyUser(
      proposal.proposerId,
      "proposal_missing_invitees",
      `Proposal "${proposal.title}" was returned to drafts — add invitees or mark solo.`,
      { proposalId: proposal.id },
    );
  }
}
