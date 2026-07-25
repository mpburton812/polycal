import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  locations,
  locationResidents,
  sleepingPartnerships,
  users,
} from "@/lib/db/schema";
import { ensureOwnedPassivesInNetwork } from "@/lib/networks/membership";

/**
 * Copies residences and/or sleeping ties with owned passives into a destination
 * network as new rows (PC-361). Shared by wizard actions and e2e fixtures.
 */
export async function importResidencesAndPassiveSleeping(input: {
  userId: string;
  sourceNetworkId: string;
  destNetworkId: string;
  importResidences: boolean;
  importPassiveSleeping: boolean;
}): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const ownedPassives = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.ownedByUserId, input.userId), eq(users.role, "passive")));
  const passiveIds = new Set(ownedPassives.map((p) => p.id));

  if (input.importResidences) {
    const myResidencies = await db
      .select({
        residency: locationResidents,
        location: locations,
      })
      .from(locationResidents)
      .innerJoin(locations, eq(locationResidents.locationId, locations.id))
      .where(
        and(
          eq(locationResidents.userId, input.userId),
          eq(locationResidents.status, "accepted"),
          eq(locations.networkId, input.sourceNetworkId),
        ),
      );

    for (const row of myResidencies) {
      const newLocId = randomUUID();
      await db.insert(locations).values({
        id: newLocId,
        networkId: input.destNetworkId,
        name: row.location.name,
        description: row.location.description,
        address: row.location.address,
        bedroomCount: row.location.bedroomCount,
        bedroomNames: row.location.bedroomNames,
        createdById: input.userId,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(locationResidents).values({
        id: randomUUID(),
        locationId: newLocId,
        userId: input.userId,
        status: "accepted",
        placeRole: row.residency.placeRole,
        proposedById: input.userId,
        createdAt: now,
        updatedAt: now,
        respondedAt: now,
      });

      const otherResidents = await db
        .select()
        .from(locationResidents)
        .where(
          and(
            eq(locationResidents.locationId, row.location.id),
            eq(locationResidents.status, "accepted"),
          ),
        );
      for (const other of otherResidents) {
        if (other.userId === input.userId) continue;
        if (!passiveIds.has(other.userId)) continue;
        await db.insert(locationResidents).values({
          id: randomUUID(),
          locationId: newLocId,
          userId: other.userId,
          status: "accepted",
          placeRole: other.placeRole,
          proposedById: input.userId,
          createdAt: now,
          updatedAt: now,
          respondedAt: now,
        });
      }
    }
  }

  if (input.importPassiveSleeping) {
    const partnerships = await db
      .select()
      .from(sleepingPartnerships)
      .where(
        and(
          eq(sleepingPartnerships.networkId, input.sourceNetworkId),
          eq(sleepingPartnerships.status, "accepted"),
        ),
      );

    for (const p of partnerships) {
      const involvesUser =
        p.userLowId === input.userId || p.userHighId === input.userId;
      if (!involvesUser) continue;
      const otherId = p.userLowId === input.userId ? p.userHighId : p.userLowId;
      if (!passiveIds.has(otherId)) continue;

      const [low, high] =
        input.userId < otherId
          ? [input.userId, otherId]
          : [otherId, input.userId];
      await db.insert(sleepingPartnerships).values({
        id: randomUUID(),
        networkId: input.destNetworkId,
        userLowId: low,
        userHighId: high,
        status: "accepted",
        proposedById: input.userId,
        createdAt: now,
        updatedAt: now,
        respondedAt: now,
        passiveAutoAccepted: true,
      });
    }
  }

  await ensureOwnedPassivesInNetwork(input.userId, input.destNetworkId);
}
