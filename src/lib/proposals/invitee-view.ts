import { and, eq, isNull } from "drizzle-orm";

import type { getDb } from "@/lib/db/client";
import { proposalInvitees, type ProposalState } from "@/lib/db/schema";

/**
 * Whether opening proposal detail should stamp viewed_at for the viewer (PC-76).
 */
export function shouldRecordProposalInviteeView(params: {
  proposalState: ProposalState;
  masked: boolean;
  isInvitee: boolean;
  viewedAt: string | null | undefined;
}): boolean {
  return (
    params.isInvitee &&
    !params.masked &&
    (params.proposalState === "proposed" || params.proposalState === "resolved") &&
    !params.viewedAt
  );
}

/**
 * Idempotently records the first time an invitee opens proposal detail.
 */
export async function recordProposalInviteeView(
  db: ReturnType<typeof getDb>,
  proposalId: string,
  userId: string,
): Promise<string> {
  const now = new Date().toISOString();
  await db
    .update(proposalInvitees)
    .set({ viewedAt: now })
    .where(
      and(
        eq(proposalInvitees.proposalId, proposalId),
        eq(proposalInvitees.userId, userId),
        isNull(proposalInvitees.viewedAt),
      ),
    );
  return now;
}
