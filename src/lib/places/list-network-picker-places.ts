import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { locationResidents, locations, networkMembers } from "@/lib/db/schema";
import { placeQualifiesForProposalPicker } from "@/lib/places/picker-eligibility";

type Db = ReturnType<typeof getDb>;

export interface PickerPlaceRow {
  id: string;
  name: string;
  bedroomCount: number;
  bedroomNames: string | null;
  createdById: string | null;
  residentUserIds: string[];
}

/**
 * Network-scoped places that still have a living member (or were created by the viewer).
 */
export async function listNetworkPickerPlaces(
  db: Db,
  input: {
    networkId: string;
    viewerId: string;
    restrictToLocationIds?: string[] | null;
  },
): Promise<PickerPlaceRow[]> {
  const placeSelect = {
    id: locations.id,
    name: locations.name,
    bedroomCount: locations.bedroomCount,
    bedroomNames: locations.bedroomNames,
    createdById: locations.createdById,
  };

  const networkPlaces = await db
    .select(placeSelect)
    .from(locations)
    .where(eq(locations.networkId, input.networkId))
    .orderBy(asc(locations.name));

  const restrict = input.restrictToLocationIds
    ? new Set(input.restrictToLocationIds)
    : null;
  const candidates = restrict
    ? networkPlaces.filter((place) => restrict.has(place.id))
    : networkPlaces;
  if (candidates.length === 0) return [];

  const memberRows = await db
    .select({ userId: networkMembers.userId })
    .from(networkMembers)
    .where(
      and(eq(networkMembers.networkId, input.networkId), eq(networkMembers.status, "active")),
    );
  const activeMemberIds = new Set(memberRows.map((row) => row.userId));

  const residentRows = await db
    .select({
      locationId: locationResidents.locationId,
      userId: locationResidents.userId,
    })
    .from(locationResidents)
    .where(
      and(
        inArray(
          locationResidents.locationId,
          candidates.map((place) => place.id),
        ),
        eq(locationResidents.status, "accepted"),
      ),
    );

  const residentsByPlace = new Map<string, string[]>();
  for (const row of residentRows) {
    const list = residentsByPlace.get(row.locationId) ?? [];
    list.push(row.userId);
    residentsByPlace.set(row.locationId, list);
  }

  return candidates
    .filter((place) =>
      placeQualifiesForProposalPicker({
        createdById: place.createdById,
        viewerId: input.viewerId,
        acceptedResidentIds: residentsByPlace.get(place.id) ?? [],
        activeMemberIds,
      }),
    )
    .map((place) => ({
      ...place,
      residentUserIds: residentsByPlace.get(place.id) ?? [],
    }));
}
