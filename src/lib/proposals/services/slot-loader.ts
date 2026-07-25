/**
 * Batched proposal time-slot loading (PC-355).
 *
 * Conflict detection and the enforcement sweeps used to issue one slot SELECT
 * per candidate proposal (N+1). These helpers fetch every slot for a batch of
 * proposal ids in chunked `IN (…)` queries and group them in memory, so the
 * callers keep identical per-proposal window building with a bounded query count.
 */
import { asc, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { proposalTimeSlots } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Max ids per `IN (…)` clause. SQLite's default host-parameter ceiling is 999;
 * 200 keeps statements small while still collapsing N+1 loops.
 */
const ID_CHUNK_SIZE = 200;

export interface ProposalSlotRow {
  id: string;
  proposalId: string;
  startAt: string;
  endAt: string | null;
  label: string | null;
  isDetached: boolean;
}

/** Splits `items` into fixed-size chunks for parameterised IN clauses. */
export function chunkIds<T>(items: T[], size: number = ID_CHUNK_SIZE): T[][] {
  if (items.length <= size) return items.length > 0 ? [items] : [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Loads all time slots for the given proposals, grouped by proposal id.
 * Proposals without slots are simply absent from the map.
 */
export async function loadSlotsByProposalIds(
  db: Db,
  proposalIds: string[],
): Promise<Map<string, ProposalSlotRow[]>> {
  const grouped = new Map<string, ProposalSlotRow[]>();
  const unique = [...new Set(proposalIds)];

  for (const chunk of chunkIds(unique)) {
    const rows = await db
      .select({
        id: proposalTimeSlots.id,
        proposalId: proposalTimeSlots.proposalId,
        startAt: proposalTimeSlots.startAt,
        endAt: proposalTimeSlots.endAt,
        label: proposalTimeSlots.label,
        isDetached: proposalTimeSlots.isDetached,
      })
      .from(proposalTimeSlots)
      .where(inArray(proposalTimeSlots.proposalId, chunk))
      .orderBy(asc(proposalTimeSlots.startAt));

    for (const row of rows) {
      const list = grouped.get(row.proposalId) ?? [];
      list.push(row);
      grouped.set(row.proposalId, list);
    }
  }

  return grouped;
}
