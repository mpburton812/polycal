import { and, eq } from "drizzle-orm";

import { userHasAdminAccess } from "@/lib/admin-access";
import type { getDb } from "@/lib/db/client";
import { locationResidents } from "@/lib/db/schema";
import type { PlaceRole } from "@/types/relationship";
import type { UserRole } from "@/types/user";

type Db = ReturnType<typeof getDb>;

/**
 * True when the user is an accepted place owner (or app admin).
 */
export async function userIsPlaceOwner(
  db: Db,
  userId: string,
  role: UserRole,
  locationId: string,
): Promise<boolean> {
  if (await userHasAdminAccess(role)) return true;

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
 * Display-name lists of accepted owners and residents for a place.
 */
export async function listAcceptedPlaceMemberNames(
  db: Db,
  locationId: string,
): Promise<{ owners: string[]; residents: string[] }> {
  const { users } = await import("@/lib/db/schema");
  const rows = await db
    .select({
      displayName: users.displayName,
      placeRole: locationResidents.placeRole,
    })
    .from(locationResidents)
    .innerJoin(users, eq(locationResidents.userId, users.id))
    .where(
      and(
        eq(locationResidents.locationId, locationId),
        eq(locationResidents.status, "accepted"),
      ),
    );

  const owners: string[] = [];
  const residents: string[] = [];
  for (const row of rows) {
    const role = (row.placeRole ?? "resident") as PlaceRole;
    if (role === "owner") owners.push(row.displayName);
    else residents.push(row.displayName);
  }
  return { owners, residents };
}
