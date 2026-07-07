import { eq } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees, proposals } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import {
  computeAtRiskExpiresAt,
  loadEnforcementSettings,
} from "@/lib/proposals/enforcement";

import { logProposalTransition } from "./state-log";
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

  await notifyUser(
    proposal.proposerId,
    "proposal_at_risk",
    `Proposal "${proposal.title}" is at risk. Cancel, re-draft, or update attendees.`,
    { proposalId: proposal.id, action: "at_risk_options", proposalType: proposal.proposalType },
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
      { proposalId: proposal.id, action: "vote", proposalType: proposal.proposalType },
    );
  }
}
