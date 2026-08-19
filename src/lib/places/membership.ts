import { and, eq, inArray } from "drizzle-orm";

import { userHasAdminAccess, type AdminAccessSession } from "@/lib/admin-access";
import type { getDb } from "@/lib/db/client";
import { locationResidents } from "@/lib/db/schema";
import type { PlaceRole } from "@/types/relationship";

type Db = ReturnType<typeof getDb>;

/**
 * True when the user is an accepted place owner (or app admin).
 */
export async function userIsPlaceOwner(
  db: Db,
  userId: string,
  access: AdminAccessSession,
  locationId: string,
): Promise<boolean> {
  if (await userHasAdminAccess(access)) return true;

  const [row] = await db
    .select({ id: locationResidents.id })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, locationId),
        eq(locationResidents.userId, userId),
        eq(locationResidents.status, "accepted"),
        eq(locationResidents.placeRole, "owner"),
      ),
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Accepted owners for a place (required invitees on self-join proposals).
 */
export async function listAcceptedPlaceOwners(
  db: Db,
  locationId: string,
): Promise<Array<{ userId: string; displayName: string }>> {
  const { users } = await import("@/lib/db/schema");
  const rows = await db
    .select({
      userId: locationResidents.userId,
      displayName: users.displayName,
    })
    .from(locationResidents)
    .innerJoin(users, eq(locationResidents.userId, users.id))
    .where(
      and(
        eq(locationResidents.locationId, locationId),
        eq(locationResidents.status, "accepted"),
        eq(locationResidents.placeRole, "owner"),
      ),
    );

  return rows;
}

/**
 * Groups accepted owner/resident display names by location (PC-449).
 * Used so composer place options can hydrate members in one query.
 */
export function groupAcceptedPlaceMembers(
  rows: Array<{ locationId: string; displayName: string; placeRole: string | null }>,
): Map<string, { owners: string[]; residents: string[] }> {
  const byLocation = new Map<string, { owners: string[]; residents: string[] }>();
  for (const row of rows) {
    const bucket = byLocation.get(row.locationId) ?? { owners: [], residents: [] };
    const role = (row.placeRole ?? "resident") as PlaceRole;
    if (role === "owner") bucket.owners.push(row.displayName);
    else bucket.residents.push(row.displayName);
    byLocation.set(row.locationId, bucket);
  }
  return byLocation;
}

/**
 * Display-name lists of accepted owners and residents for a place.
 */
export async function listAcceptedPlaceMemberNames(
  db: Db,
  locationId: string,
): Promise<{ owners: string[]; residents: string[] }> {
  const grouped = await listAcceptedPlaceMembersByLocationIds(db, [locationId]);
  return grouped.get(locationId) ?? { owners: [], residents: [] };
}

/**
 * Accepted owners and residents for many places in one round-trip (PC-449).
 */
export async function listAcceptedPlaceMembersByLocationIds(
  db: Db,
  locationIds: string[],
): Promise<Map<string, { owners: string[]; residents: string[] }>> {
  if (locationIds.length === 0) return new Map();
  const { users } = await import("@/lib/db/schema");
  const rows = await db
    .select({
      locationId: locationResidents.locationId,
      displayName: users.displayName,
      placeRole: locationResidents.placeRole,
    })
    .from(locationResidents)
    .innerJoin(users, eq(locationResidents.userId, users.id))
    .where(
      and(inArray(locationResidents.locationId, locationIds), eq(locationResidents.status, "accepted")),
    );
  return groupAcceptedPlaceMembers(rows);
}
