import { eq } from "drizzle-orm";
import { hash } from "bcryptjs";

import { getDb } from "@/lib/db/client";
import { isNonProductionEnvironment } from "@/lib/env";
import { locations, polyGroup, users, type UserRole } from "@/lib/db/schema";

const DEFAULT_PASSWORD = "ChangeMe123!";

interface SeedUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  avatarKey: string;
  mustChangePassword: boolean;
}

/** Deterministic Star Wars cast — same IDs every seed run for stable E2E later. */
const SEED_USERS: SeedUser[] = [
  {
    id: "sw-luke",
    username: "luke",
    displayName: "Luke Skywalker",
    role: "admin",
    avatarKey: "bird_blue",
    mustChangePassword: false,
  },
  {
    id: "sw-leia",
    username: "leia",
    displayName: "Leia Organa",
    role: "user",
    avatarKey: "bird_purple",
    mustChangePassword: true,
  },
  {
    id: "sw-han",
    username: "han",
    displayName: "Han Solo",
    role: "user",
    avatarKey: "bird_orange",
    mustChangePassword: true,
  },
  {
    id: "sw-chewie",
    username: "chewie",
    displayName: "Chewbacca",
    role: "passive",
    avatarKey: "bird_green",
    mustChangePassword: false,
  },
  {
    id: "sw-vader",
    username: "vader",
    displayName: "Darth Vader",
    role: "user",
    avatarKey: "bird_red",
    mustChangePassword: true,
  },
  {
    id: "sw-obiwan",
    username: "obiwan",
    displayName: "Obi-Wan Kenobi",
    role: "user",
    avatarKey: "bird_yellow",
    mustChangePassword: true,
  },
  {
    id: "sw-yoda",
    username: "yoda",
    displayName: "Yoda",
    role: "admin",
    avatarKey: "bird_green",
    mustChangePassword: false,
  },
  {
    id: "sw-padme",
    username: "padme",
    displayName: "Padmé Amidala",
    role: "user",
    avatarKey: "bird_purple",
    mustChangePassword: true,
  },
  {
    id: "sw-anakin",
    username: "anakin",
    displayName: "Anakin Skywalker",
    role: "user",
    avatarKey: "bird_red",
    mustChangePassword: true,
  },
  {
    id: "sw-lando",
    username: "lando",
    displayName: "Lando Calrissian",
    role: "user",
    avatarKey: "bird_yellow",
    mustChangePassword: true,
  },
];

const SEED_LOCATIONS = [
  { id: "loc-falcon", name: "Millennium Falcon", description: "Smuggler freighter" },
  { id: "loc-deathstar", name: "Death Star", description: "Imperial battle station" },
  { id: "loc-dagobah", name: "Dagobah", description: "Swamp training ground" },
  { id: "loc-cloudcity", name: "Cloud City", description: "Bespin tibanna gas mine" },
  { id: "loc-tatooine", name: "Tatooine", description: "Desert homeworld" },
];

/**
 * Populates non-production databases with predictable Star Wars fixtures.
 * Skipped entirely on production per seeding policy.
 */
export async function seedStarWarsFoundation(): Promise<{ seeded: boolean }> {
  if (!isNonProductionEnvironment()) {
    return { seeded: false };
  }

  const db = getDb();
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    return { seeded: false };
  }

  const now = new Date().toISOString();
  const passwordHash = await hash(DEFAULT_PASSWORD, 12);

  await db.insert(polyGroup).values({
    id: 1,
    name: "Rebel Alliance",
    updatedAt: now,
  });

  for (const user of SEED_USERS) {
    await db.insert(users).values({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      passwordHash,
      role: user.role,
      status: "active",
      mustChangePassword: user.mustChangePassword,
      avatarKey: user.avatarKey,
      theme: "mint",
      loginCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const location of SEED_LOCATIONS) {
    await db.insert(locations).values({
      ...location,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { seeded: true };
}

/** Exposed for scripts — returns the shared default password label only in non-prod. */
export function getSeedDefaultPasswordHint(): string {
  return DEFAULT_PASSWORD;
}
