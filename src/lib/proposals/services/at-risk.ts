import { eq } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposals } from "@/lib/db/schema";
import {
  computeAtRiskExpiresAt,
  loadEnforcementSettings,
} from "@/lib/proposals/enforcement";

import { logProposalTransition } from "./state-log";
import { notifyProposalParticipants } from "./notify-participants";
import { resetInviteeVotes } from "./votes";

type Db = ReturnType<typeof getDb>;

/**
 * Flags a resolved proposal at-risk and returns it to proposed for re-approval (PC-48 / PC-98).
 */
export async function enterAtRiskProposedState(
  db: Db,
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

  // Proposer gets the at-risk resolution options; invitees get the tentative
  // calendar notice + vote deep-link. Thin wrapper over the shared fan-out that
  // preserves the prior per-audience copy and metadata exactly (PC-322).
  await notifyProposalParticipants(db, {
    proposalId: proposal.id,
    proposerId: proposal.proposerId,
    notificationType: "proposal_at_risk",
    metadata: { proposalType: proposal.proposalType },
    message: ({ isProposer }) =>
      isProposer
        ? `Proposal "${proposal.title}" is at risk. Cancel, re-draft, or update attendees.`
        : `Proposal "${proposal.title}" is tentative/at risk on the calendar until re-approved.`,
    metadataFor: ({ isProposer }) =>
      isProposer ? { action: "at_risk_options" } : { action: "vote" },
  });
}
