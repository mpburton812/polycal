import { and, eq, or } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { sleepingPartnerships } from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";

type Db = ReturnType<typeof getDb>;

/** Returns accepted sleeping partner user ids for a user (PC-50). */
async function listAcceptedPartnerIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
    })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.status, "accepted"),
        or(
          eq(sleepingPartnerships.userLowId, userId),
          eq(sleepingPartnerships.userHighId, userId),
        ),
      ),
    );

  return rows.map((row) => (row.userLowId === userId ? row.userHighId : row.userLowId));
}

/**
 * Notifies sleeping partners of both users when a partnership is added or removed (PC-50).
 */
export async function notifySleepingNetworkOfPartnershipChange(
  db: Db,
  userAId: string,
  userBId: string,
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const exclude = new Set([userAId, userBId]);
  const notifyIds = new Set<string>();

  for (const userId of [userAId, userBId]) {
    const partners = await listAcceptedPartnerIds(db, userId);
    for (const partnerId of partners) {
      if (!exclude.has(partnerId)) {
        notifyIds.add(partnerId);
      }
    }
  }

  for (const userId of notifyIds) {
    await notifyUser(userId, "partnership_network", message, metadata);
  }
}
