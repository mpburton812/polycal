import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  calendarConnections,
  locationResidents,
  locations,
  networks,
  sleepingPartnerships,
  users,
} from "@/lib/db/schema";
import { upsertMembership } from "@/lib/networks/membership";
import { canonicalUserPair } from "@/lib/users/pair";

/** E2E overlay credentials (Burton-Thompson fixture on top of Star Wars seed). */
export const E2E_BURTON_THOMPSON_PASSWORD = "password";

const OVERLAY_USERS = [
  {
    id: "tf-mpburton",
    username: "mpburton",
    displayName: "Michael Burton",
    role: "admin" as const,
    avatarKey: "bird_yellow",
  },
  {
    id: "tf-kthompson",
    username: "kthompson",
    displayName: "Katie Thompson",
    role: "admin" as const,
    avatarKey: "bird_blue",
  },
] as const;

const OVERLAY_LOCATIONS = [
  { id: "loc-michaels-place", name: "Michael's Place", residentId: "tf-mpburton" },
  { id: "loc-katies-place", name: "Katie's Place", residentId: "tf-kthompson" },
] as const;

/**
 * Resolves the default Rebel Alliance network created by networks backfill (PC-357).
 */
async function defaultNetworkId(): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select({ id: networks.id }).from(networks).limit(1);
  return row?.id ?? null;
}

/**
 * Adds Katie/Michael users, places, and sleeping partnership to the Star Wars E2E database (PC-69).
 * Stamps networkId + memberships so multi-network scoping includes the overlay (PC-357).
 */
export async function seedE2eBurtonThompsonOverlay(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  const passwordHash = await hash(E2E_BURTON_THOMPSON_PASSWORD, 12);
  const networkId = await defaultNetworkId();

  for (const user of OVERLAY_USERS) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!existing) {
      await db.insert(users).values({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        passwordHash,
        role: user.role,
        status: "active",
        mustChangePassword: false,
        avatarKey: user.avatarKey,
        theme: "mint",
        loginCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    if (networkId) {
      await upsertMembership({
        networkId,
        userId: user.id,
        role: "network_admin",
      });
    }
  }

  for (const place of OVERLAY_LOCATIONS) {
    const [existingPlace] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, place.id))
      .limit(1);
    if (!existingPlace) {
      await db.insert(locations).values({
        id: place.id,
        networkId,
        name: place.name,
        description: null,
        bedroomCount: 1,
        bedroomNames: JSON.stringify(["Main"]),
        createdById: place.residentId,
        createdAt: now,
        updatedAt: now,
      });
    } else if (networkId) {
      await db
        .update(locations)
        .set({ networkId, updatedAt: now })
        .where(and(eq(locations.id, place.id), isNull(locations.networkId)));
    }

    const [existingResident] = await db
      .select({ id: locationResidents.id })
      .from(locationResidents)
      .where(
        and(
          eq(locationResidents.locationId, place.id),
          eq(locationResidents.userId, place.residentId),
        ),
      )
      .limit(1);
    if (!existingResident) {
      await db.insert(locationResidents).values({
        id: `lr-e2e-${place.id}`,
        locationId: place.id,
        userId: place.residentId,
        status: "accepted",
        placeRole: "owner",
        proposedById: place.residentId,
        createdAt: now,
        updatedAt: now,
        respondedAt: now,
      });
    }
  }

  const [userLowId, userHighId] = canonicalUserPair("tf-kthompson", "tf-mpburton");
  const [existingPartnership] = await db
    .select({ id: sleepingPartnerships.id })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.userLowId, userLowId),
        eq(sleepingPartnerships.userHighId, userHighId),
      ),
    )
    .limit(1);

  if (!existingPartnership) {
    await db.insert(sleepingPartnerships).values({
      id: `sp-e2e-${randomUUID()}`,
      networkId,
      userLowId,
      userHighId,
      status: "accepted",
      proposedById: "tf-kthompson",
      createdAt: now,
      updatedAt: now,
      respondedAt: now,
      passiveAutoAccepted: false,
    });
  } else if (networkId) {
    await db
      .update(sleepingPartnerships)
      .set({ networkId, updatedAt: now })
      .where(
        and(eq(sleepingPartnerships.id, existingPartnership.id), isNull(sleepingPartnerships.networkId)),
      );
  }

  // Luke iCal download prefs so resolve→ICS journeys do not depend on UI/API seed races (PC-345).
  const [lukeConnection] = await db
    .select({ id: calendarConnections.id })
    .from(calendarConnections)
    .where(eq(calendarConnections.userId, "sw-luke"))
    .limit(1);
  if (lukeConnection) {
    await db
      .update(calendarConnections)
      .set({
        provider: "ics",
        icsDelivery: "download",
        googleRefreshTokenEnc: null,
        googleAccessTokenEnc: null,
        googleTokenExpiresAt: null,
        googleCalendarId: null,
        googleAccountEmail: null,
        status: "active",
        updatedAt: now,
      })
      .where(eq(calendarConnections.id, lukeConnection.id));
  } else {
    await db.insert(calendarConnections).values({
      id: randomUUID(),
      userId: "sw-luke",
      provider: "ics",
      icsDelivery: "download",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }
}
