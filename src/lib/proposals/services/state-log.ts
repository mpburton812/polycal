import { randomUUID } from "node:crypto";

import type { getDb } from "@/lib/db/client";
import { proposalStateLog } from "@/lib/db/schema";

/**
 * Accepts both the top-level db handle and a transaction executor so a single
 * transition logger can be shared by request-scoped actions and in-transaction
 * flows alike (PC-321). Mirrors the `DbExecutor` shape used by the slice actions.
 */
type DbExecutor =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Appends an immutable state transition entry for proposal audit (PC-40 / PC-98).
 *
 * This is the single source of truth for writing `proposal_state_log` rows.
 * Pass `actorUserId: null` for system-driven transitions (enforcement, recovery)
 * so callers never re-implement the insert shape (PC-321).
 */
export async function logProposalTransition(
  db: DbExecutor,
  proposalId: string,
  actorUserId: string | null,
  action: string,
  details?: string | null,
): Promise<void> {
  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId,
    action,
    details: details ?? null,
    createdAt: new Date().toISOString(),
  });
}
