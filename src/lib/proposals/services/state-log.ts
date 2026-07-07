import { randomUUID } from "node:crypto";

import type { getDb } from "@/lib/db/client";
import { proposalStateLog } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Appends an immutable state transition entry for proposal audit (PC-40 / PC-98).
 */
export async function logProposalTransition(
  db: Db,
  proposalId: string,
  actorUserId: string | null,
  action: string,
  details?: string,
): Promise<void> {
  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}
