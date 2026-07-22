/**
 * Shared sleeping-partner and eligible-location loaders (PC-305).
 * Single source for schedule, slices, proposals, and fast-sleeping paths.
 */

import { and, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { locationResidents, sleepingPartnerships } from "@/lib/db/schema";

type Db = ReturnType<typeof getDb>;

/**
 * Accepted sleeping partner user ids for a subject (undirected edges).
 */
export async function getAcceptedSleepingPartnerIds(
  db: Db,
  userId: string,
): Promise<Set<string>> {
  const partnershipRows = await db
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

  return new Set(
    partnershipRows.map((row) => (row.userLowId === userId ? row.userHighId : row.userLowId)),
  );
}

/**
 * Location IDs the user may schedule at — own residency plus sleeping partners' places (PC-43).
 */
export async function getEligibleLocationIdsForUser(
  db: Db,
  userId: string,
): Promise<string[]> {
  const directRows = await db
    .select({ locationId: locationResidents.locationId })
    .from(locationResidents)
    .where(
      and(eq(locationResidents.userId, userId), eq(locationResidents.status, "accepted")),
    );

  const partners = [...(await getAcceptedSleepingPartnerIds(db, userId))];
  let networkLocationIds: string[] = [];
  if (partners.length > 0) {
    const partnerResidency = await db
      .select({ locationId: locationResidents.locationId })
      .from(locationResidents)
      .where(
        and(
          inArray(locationResidents.userId, partners),
          eq(locationResidents.status, "accepted"),
        ),
      );
    networkLocationIds = partnerResidency.map((row) => row.locationId);
  }

  return [...new Set([...directRows.map((row) => row.locationId), ...networkLocationIds])];
}

/**
 * Union of eligible residence places for a set of users (sleeping location picker).
 */
export async function getEligibleLocationIdsForUsers(
  db: Db,
  userIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  for (const userId of userIds) {
    for (const locationId of await getEligibleLocationIdsForUser(db, userId)) {
      ids.add(locationId);
    }
  }
  return [...ids];
}
