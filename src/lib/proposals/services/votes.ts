import { eq } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees, proposalSlotVotes, proposals } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/** Clears invitee votes, slot matrix votes, and winning slot (PC-40 / PC-98). */
export async function wipeProposalVotes(db: Db, proposalId: string): Promise<void> {
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

/** Resets all votes on a proposal before re-opening it for approval (PC-98). */
export async function resetInviteeVotes(db: Db, proposalId: string): Promise<void> {
  await wipeProposalVotes(db, proposalId);
}
