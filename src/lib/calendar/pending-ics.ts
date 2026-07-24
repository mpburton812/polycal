/**
 * Looks up the latest non-dismissed ICS pending row per proposal for a user (PC-345).
 * Includes already-downloaded rows so Download ICS stays available after the first download.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { calendarIcsPending } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Returns a map of proposalId → latest pending ICS id for the given user.
 * Dismissed rows are excluded; downloaded rows are included.
 */
export async function latestIcsPendingIdsByProposal(
  db: Db,
  userId: string,
  proposalIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (proposalIds.length === 0) return map;

  const rows = await db
    .select({
      id: calendarIcsPending.id,
      proposalId: calendarIcsPending.proposalId,
    })
    .from(calendarIcsPending)
    .where(
      and(
        eq(calendarIcsPending.userId, userId),
        inArray(calendarIcsPending.proposalId, proposalIds),
        isNull(calendarIcsPending.dismissedAt),
      ),
    )
    .orderBy(desc(calendarIcsPending.createdAt));

  for (const row of rows) {
    if (!map.has(row.proposalId)) {
      map.set(row.proposalId, row.id);
    }
  }
  return map;
}
