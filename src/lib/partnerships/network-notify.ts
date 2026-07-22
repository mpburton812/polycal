import { getAcceptedSleepingPartnerIds } from "@/lib/proposals/partners";
import { notifyUser } from "@/lib/notifications";

type Db = ReturnType<typeof getDb>;

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
    const partners = await getAcceptedSleepingPartnerIds(db, userId);
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
