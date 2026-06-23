"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { locationResidents, locations, users } from "@/lib/db/schema";

const placeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).optional(),
  bedroomCount: z.number().int().min(0).max(20),
  bedroomNames: z.array(z.string().trim().min(1).max(60)).optional(),
  description: z.string().trim().max(500).optional(),
});

const respondResidencySchema = z.object({
  residencyId: z.string().min(1),
  accept: z.boolean(),
});

export interface PlaceSummary {
  id: string;
  name: string;
  address: string | null;
  bedroomCount: number;
  bedroomNames: string[];
  residentCount: number;
}

export interface ResidentView {
  id: string;
  userId: string;
  displayName: string;
  status: string;
  isIncoming: boolean;
}

function parseBedroomNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Lists places with accepted resident counts (PC-37).
 */
export async function listPlacesAction(): Promise<PlaceSummary[]> {
  await ensureDbReady();
  const db = getDb();
  const rows = await db.select().from(locations).orderBy(asc(locations.name));
  const residents = await db.select().from(locationResidents);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address ?? null,
    bedroomCount: row.bedroomCount,
    bedroomNames: parseBedroomNames(row.bedroomNames),
    residentCount: residents.filter(
      (resident) => resident.locationId === row.id && resident.status === "accepted",
    ).length,
  }));
}

/**
 * Creates a place with optional bedroom labels (PC-37).
 */
export async function createPlaceAction(
  input: z.infer<typeof placeSchema>,
): Promise<{ ok: boolean; message: string; placeId?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = placeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  const placeId = `place-${randomUUID()}`;
  const bedroomNames =
    parsed.data.bedroomNames ??
    Array.from({ length: parsed.data.bedroomCount }, (_, index) => `Bedroom ${index + 1}`);

  await db.insert(locations).values({
    id: placeId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    address: parsed.data.address ?? null,
    bedroomCount: parsed.data.bedroomCount,
    bedroomNames: JSON.stringify(bedroomNames),
    createdById: session.user.id,
    createdAt: now,
    updatedAt: now,
  });

  await logUserActivity(session.user.id, "places.create", placeId);
  revalidatePath("/people-places");

  return { ok: true, message: `Created place ${parsed.data.name}.`, placeId };
}

/**
 * Lists residents and pending residency proposals for a place (PC-37).
 */
export async function listResidentsForPlaceAction(
  locationId: string,
): Promise<ResidentView[]> {
  await ensureDbReady();
  const session = await auth();
  const db = getDb();

  const rows = await db
    .select({
      id: locationResidents.id,
      userId: locationResidents.userId,
      status: locationResidents.status,
      proposedById: locationResidents.proposedById,
      displayName: users.displayName,
    })
    .from(locationResidents)
    .innerJoin(users, eq(locationResidents.userId, users.id))
    .where(eq(locationResidents.locationId, locationId));

  const viewerId = session?.user?.id;

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    status: row.status,
    isIncoming:
      row.status === "proposed" &&
      Boolean(viewerId) &&
      row.proposedById !== viewerId &&
      row.userId === viewerId,
  }));
}

/**
 * Associates a user with a place; passive users auto-accept residency (PC-37).
 */
export async function proposeResidencyAction(
  locationId: string,
  targetUserId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [place] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!place || !target || target.status !== "active") {
    return { ok: false, message: "Place or user not found." };
  }

  const [existing] = await db
    .select()
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, locationId),
        eq(locationResidents.userId, targetUserId),
      ),
    )
    .limit(1);

  if (existing?.status === "accepted") {
    return { ok: false, message: "User is already associated with this place." };
  }

  const now = new Date().toISOString();
  const autoAccept = target.role === "passive";
  const status = autoAccept ? "accepted" : "proposed";

  if (existing) {
    await db
      .update(locationResidents)
      .set({
        status,
        proposedById: session.user.id,
        updatedAt: now,
        respondedAt: autoAccept ? now : null,
      })
      .where(eq(locationResidents.id, existing.id));
  } else {
    await db.insert(locationResidents).values({
      id: `lr-${randomUUID()}`,
      locationId,
      userId: targetUserId,
      status,
      proposedById: session.user.id,
      createdAt: now,
      updatedAt: now,
      respondedAt: autoAccept ? now : null,
    });
  }

  await logUserActivity(
    session.user.id,
    "places.propose_residency",
    JSON.stringify({ locationId, targetUserId, status }),
  );
  revalidatePath("/people-places");

  return {
    ok: true,
    message: autoAccept
      ? `${target.displayName} associated with place.`
      : `Residency proposal sent to ${target.displayName}.`,
  };
}

/**
 * Accept or decline an incoming residency proposal (PC-37).
 */
export async function respondResidencyAction(
  input: z.infer<typeof respondResidencySchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = respondResidencySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid request." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(locationResidents)
    .where(eq(locationResidents.id, parsed.data.residencyId))
    .limit(1);

  if (!row || row.status !== "proposed" || row.userId !== session.user.id) {
    return { ok: false, message: "Proposal not found." };
  }

  const now = new Date().toISOString();
  const status = parsed.data.accept ? "accepted" : "declined";

  await db
    .update(locationResidents)
    .set({ status, updatedAt: now, respondedAt: now })
    .where(eq(locationResidents.id, row.id));

  await logUserActivity(
    session.user.id,
    parsed.data.accept ? "places.accept_residency" : "places.decline_residency",
    row.id,
  );
  revalidatePath("/people-places");

  return {
    ok: true,
    message: parsed.data.accept ? "Residency accepted." : "Residency declined.",
  };
}
