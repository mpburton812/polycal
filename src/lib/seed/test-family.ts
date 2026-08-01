import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";

import { getDb } from "@/lib/db/client";
import { isNonProductionEnvironment } from "@/lib/env";
import {
  locationResidents,
  locations,
  networks,
  sleepingPartnerships,
  users,
  type UserRole,
} from "@/lib/db/schema";
import { canonicalUserPair } from "@/lib/users/pair";
import { isPlatformAdminIdentity } from "@/lib/platform/platform-admins";

export const TEST_FAMILY_DEFAULT_PASSWORD = "password";

interface TestFamilyUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarKey: string;
}

/** Deterministic test-environment cast — stable IDs for Turso polycal-test. */
const TEST_FAMILY_USERS: TestFamilyUser[] = [
  {
    id: "tf-mpburton",
    username: "mpburton",
    displayName: "Michael Burton",
    role: "admin",
    avatarKey: "bird_yellow",
  },
  {
    id: "tf-kthompson",
    username: "kthompson",
    displayName: "Katie Thompson",
    role: "admin",
    avatarKey: "bird_blue",
  },
  {
    id: "tf-bailey",
    username: "bailey",
    displayName: "Bailey",
    role: "user",
    avatarKey: "bird_blue",
  },
  {
    id: "tf-izzy",
    username: "izzy",
    displayName: "Izzy",
    role: "user",
    avatarKey: "bird_blue",
  },
  {
    id: "tf-zachery",
    username: "zachery",
    displayName: "Zachery",
    role: "passive",
    avatarKey: "bird_blue",
  },
];

const TEST_FAMILY_LOCATIONS = [
  {
    id: "loc-michaels-place",
    name: "Michael's Place",
    residentUsername: "mpburton",
  },
  {
    id: "loc-katies-place",
    name: "Katie's Place",
    residentUsername: "kthompson",
  },
  {
    id: "loc-lake-house",
    name: "Lake House",
    residentUsername: "zachery",
  },
] as const;

const TEST_FAMILY_PARTNERSHIPS = [
  { a: "mpburton", b: "kthompson" },
  { a: "mpburton", b: "izzy" },
  { a: "kthompson", b: "zachery" },
] as const;

/**
 * Populates the test deployment database with the Burton-Thompson family fixture set.
 * Skipped on production and when users already exist (unless force).
 */
export async function seedTestFamilyFoundation(options?: {
  force?: boolean;
}): Promise<{ seeded: boolean }> {
  if (!isNonProductionEnvironment()) {
    return { seeded: false };
  }

  const db = getDb();
  if (!options?.force) {
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      return { seeded: false };
    }
  }

  const now = new Date().toISOString();
  const passwordHash = await hash(TEST_FAMILY_DEFAULT_PASSWORD, 12);
  const userIdByUsername = new Map(
    TEST_FAMILY_USERS.map((user) => [user.username, user.id]),
  );
  const adminUserId = userIdByUsername.get("mpburton") ?? TEST_FAMILY_USERS[0].id;

  await db.insert(networks).values({
    id: "seed-network-burton-thompson",
    name: "Burton-Thompson",
    allowUserProvisioning: false,
    createdAt: now,
    updatedAt: now,
  });

  for (const user of TEST_FAMILY_USERS) {
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
      timezone: "America/New_York",
      loginCount: 0,
      isPlatformAdmin: isPlatformAdminIdentity({ username: user.username }),
      notificationEmail:
        user.username === "mpburton" ? "mpburton@gmail.com" : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const location of TEST_FAMILY_LOCATIONS) {
    const residentUserId = userIdByUsername.get(location.residentUsername);
    if (!residentUserId) {
      throw new Error(`Missing resident user for ${location.name}`);
    }

    await db.insert(locations).values({
      id: location.id,
      name: location.name,
      description: null,
      bedroomCount: 1,
      bedroomNames: JSON.stringify(["Main"]),
      createdById: residentUserId,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(locationResidents).values({
      id: randomUUID(),
      locationId: location.id,
      userId: residentUserId,
      status: "accepted",
      placeRole: "owner",
      proposedById: adminUserId,
      createdAt: now,
      updatedAt: now,
      respondedAt: now,
    });
  }

  for (const edge of TEST_FAMILY_PARTNERSHIPS) {
    const userA = userIdByUsername.get(edge.a);
    const userB = userIdByUsername.get(edge.b);
    if (!userA || !userB) {
      throw new Error(`Missing partnership user for ${edge.a} ↔ ${edge.b}`);
    }

    const passiveInvolved =
      TEST_FAMILY_USERS.find((user) => user.id === userB)?.role === "passive" ||
      TEST_FAMILY_USERS.find((user) => user.id === userA)?.role === "passive";
    const proposedById = userIdByUsername.get(edge.a) ?? adminUserId;
    const [userLowId, userHighId] = canonicalUserPair(userA, userB);

    await db.insert(sleepingPartnerships).values({
      id: `sp-tf-${randomUUID()}`,
      userLowId,
      userHighId,
      status: "accepted",
      proposedById,
      createdAt: now,
      updatedAt: now,
      respondedAt: now,
      passiveAutoAccepted: passiveInvolved,
    });
  }

  return { seeded: true };
}

/** Exposed for scripts — returns the shared test password label only in non-prod. */
export function getTestFamilyPasswordHint(): string {
  return TEST_FAMILY_DEFAULT_PASSWORD;
}
