"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { logUserActivity } from "@/lib/audit";
import { formatActivityLogDetails } from "@/lib/audit/activity-log-display";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locationResidents,
  locations,
  proposalInvitees,
  proposals,
  userActivityLog,
  users,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import { userIsPlaceOwner } from "@/lib/places/membership";
import type { PlaceRole } from "@/types/relationship";
import type { UserRole } from "@/types/user";

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

const addPersonToPlaceSchema = z.object({
  locationId: z.string().min(1),
  targetUserId: z.string().min(1),
  placeRole: z.enum(["owner", "resident"]),
});

const updatePlaceMemberRoleSchema = z.object({
  locationId: z.string().min(1),
  targetUserId: z.string().min(1),
  placeRole: z.enum(["owner", "resident"]),
});

const removePersonFromPlaceSchema = z.object({
  locationId: z.string().min(1),
  targetUserId: z.string().min(1),
});

export interface PlaceSummary {
  id: string;
  name: string;
  address: string | null;
  bedroomCount: number;
  bedroomNames: string[];
  residentCount: number;
  residents: ResidentView[];
  createdById: string | null;
}

export interface ResidentView {
  id: string;
  userId: string;
  displayName: string;
  status: string;
  placeRole: PlaceRole;
  isIncoming: boolean;
}

/** Summary shown before confirming place deletion (PC-37). */
export interface PlaceDeleteImpact {
  placeName: string;
  activeProposalCount: number;
  scheduledEventCount: number;
  pendingResidencyCount: number;
  affectedProposalCount: number;
}

const PLACE_DELETED_DRAFT_NOTE =
  "Place was deleted. Location cleared and proposal moved to your drafts.";

function appendProposalNote(existing: string | null, line: string): string {
  if (!existing?.trim()) return line;
  return `${existing.trim()}\n${line}`;
}

/** True when a resolved proposal should be treated as a future scheduled event. */
function isFutureScheduledEvent(scheduledStartAt: string | null): boolean {
  if (!scheduledStartAt) return true;
  return scheduledStartAt >= new Date().toISOString();
}

/**
 * Whether the viewer may edit a place (admin, creator, or accepted resident) (PC-56).
 */
async function userCanEditPlace(
  db: ReturnType<typeof getDb>,
  userId: string,
  role: UserRole,
  placeId: string,
): Promise<boolean> {
  if (await userHasAdminAccess(role)) return true;

  const [place] = await db.select().from(locations).where(eq(locations.id, placeId)).limit(1);
  if (!place) return false;
  if (place.createdById === userId) return true;

  const [resident] = await db
    .select({ id: locationResidents.id })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, placeId),
        eq(locationResidents.userId, userId),
        eq(locationResidents.status, "accepted"),
      ),
    )
    .limit(1);

  return Boolean(resident);
}

/**
 * Whether the viewer may delete a place (admin, creator, or accepted resident).
 */
async function userCanDeletePlace(
  db: ReturnType<typeof getDb>,
  userId: string,
  role: UserRole,
  placeId: string,
): Promise<boolean> {
  if (await userHasAdminAccess(role)) return true;

  const [place] = await db.select().from(locations).where(eq(locations.id, placeId)).limit(1);
  if (!place) return false;
  if (place.createdById === userId) return true;

  const [resident] = await db
    .select({ id: locationResidents.id })
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, placeId),
        eq(locationResidents.userId, userId),
        eq(locationResidents.status, "accepted"),
      ),
    )
    .limit(1);

  return Boolean(resident);
}

/**
 * Loads linked proposals and residency rows that matter for delete confirmation (PC-37).
 */
export async function getPlaceDeleteImpactAction(
  placeId: string,
): Promise<{ ok: boolean; message: string; impact?: PlaceDeleteImpact }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [place] = await db.select().from(locations).where(eq(locations.id, placeId)).limit(1);
  if (!place) {
    return { ok: false, message: "Place not found." };
  }

  if (!(await userCanDeletePlace(db, session.user.id, session.user.role, placeId))) {
    return { ok: false, message: "You cannot delete this place." };
  }

  const linkedProposals = await db
    .select({
      id: proposals.id,
      state: proposals.state,
      scheduledStartAt: proposals.scheduledStartAt,
    })
    .from(proposals)
    .where(eq(proposals.locationId, placeId));

  const activeProposalCount = linkedProposals.filter((row) => row.state === "proposed").length;
  const scheduledEventCount = linkedProposals.filter(
    (row) => row.state === "resolved" && isFutureScheduledEvent(row.scheduledStartAt),
  ).length;

  const pendingResidents = await db
    .select({ id: locationResidents.id })
    .from(locationResidents)
    .where(
      and(eq(locationResidents.locationId, placeId), eq(locationResidents.status, "proposed")),
    );

  const affectedProposalCount = activeProposalCount + scheduledEventCount;

  return {
    ok: true,
    message: "Impact loaded.",
    impact: {
      placeName: place.name,
      activeProposalCount,
      scheduledEventCount,
      pendingResidencyCount: pendingResidents.length,
      affectedProposalCount,
    },
  };
}

/**
 * Moves active or future scheduled proposals to drafts and notifies stakeholders (PC-37).
 */
async function revertProposalsForDeletedPlace(
  db: ReturnType<typeof getDb>,
  placeId: string,
  placeName: string,
  deletedByUserId: string,
): Promise<number> {
  const linked = await db.select().from(proposals).where(eq(proposals.locationId, placeId));
  const now = new Date().toISOString();
  let movedCount = 0;

  for (const proposal of linked) {
    const shouldMoveToDraft =
      proposal.state === "proposed" ||
      (proposal.state === "resolved" && isFutureScheduledEvent(proposal.scheduledStartAt));

    if (shouldMoveToDraft) {
      await db
        .update(proposals)
        .set({
          state: "draft",
          locationId: null,
          scheduledStartAt: null,
          notes: appendProposalNote(proposal.notes, PLACE_DELETED_DRAFT_NOTE),
          updatedAt: now,
        })
        .where(eq(proposals.id, proposal.id));

      const inviteeRows = await db
        .select({ userId: proposalInvitees.userId })
        .from(proposalInvitees)
        .where(eq(proposalInvitees.proposalId, proposal.id));

      const notifyIds = new Set<string>([proposal.proposerId, ...inviteeRows.map((r) => r.userId)]);
      const notificationMessage = `Place "${placeName}" was deleted. Proposal "${proposal.title}" was moved to drafts.`;

      for (const userId of notifyIds) {
        await notifyUser(userId, "place_deleted_proposal_reverted", notificationMessage, {
          placeId,
          placeName,
          proposalId: proposal.id,
          proposalTitle: proposal.title,
          deletedByUserId,
        });
      }

      movedCount += 1;
      continue;
    }

    if (proposal.locationId) {
      await db
        .update(proposals)
        .set({ locationId: null, updatedAt: now })
        .where(eq(proposals.id, proposal.id));
    }
  }

  return movedCount;
}

function parseBedroomNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function normalizePlaceName(name: string): string {
  return name.trim().toLowerCase();
}

/** True when another place already uses this name (case-insensitive). */
async function isPlaceNameTaken(
  db: ReturnType<typeof getDb>,
  name: string,
  excludePlaceId?: string,
): Promise<boolean> {
  const normalized = normalizePlaceName(name);
  const rows = await db.select({ id: locations.id, name: locations.name }).from(locations);
  return rows.some(
    (row) =>
      row.id !== excludePlaceId && normalizePlaceName(row.name) === normalized,
  );
}

function mapResidentRows(
  rows: {
    id: string;
    userId: string;
    status: string;
    placeRole?: string | null;
    proposedById: string;
    displayName: string;
  }[],
  viewerId?: string,
): ResidentView[] {
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    status: row.status,
    placeRole: row.placeRole === "owner" ? "owner" : "resident",
    isIncoming:
      row.status === "proposed" &&
      Boolean(viewerId) &&
      row.proposedById !== viewerId &&
      row.userId === viewerId,
  }));
}

/**
 * Lists places with accepted resident counts (PC-37).
 */
export async function listPlacesAction(): Promise<PlaceSummary[]> {
  await ensureDbReady();
  const session = await auth();
  const db = getDb();
  const rows = await db.select().from(locations).orderBy(asc(locations.name));
  const residentRows = await db
    .select({
      id: locationResidents.id,
      locationId: locationResidents.locationId,
      userId: locationResidents.userId,
      status: locationResidents.status,
      placeRole: locationResidents.placeRole,
      proposedById: locationResidents.proposedById,
      displayName: users.displayName,
    })
    .from(locationResidents)
    .innerJoin(users, eq(locationResidents.userId, users.id));

  const viewerId = session?.user?.id;

  return rows.map((row) => {
    const placeResidents = residentRows.filter((resident) => resident.locationId === row.id);
    return {
      id: row.id,
      name: row.name,
      address: row.address ?? null,
      bedroomCount: row.bedroomCount,
      bedroomNames: parseBedroomNames(row.bedroomNames),
      residentCount: placeResidents.filter((resident) => resident.status === "accepted")
        .length,
      residents: mapResidentRows(placeResidents, viewerId),
      createdById: row.createdById ?? null,
    };
  });
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
  if (await isPlaceNameTaken(db, parsed.data.name)) {
    return { ok: false, message: "A place with this name is already in use." };
  }
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

  await db.insert(locationResidents).values({
    id: `lr-${randomUUID()}`,
    locationId: placeId,
    userId: session.user.id,
    status: "accepted",
    placeRole: "owner",
    proposedById: session.user.id,
    createdAt: now,
    updatedAt: now,
    respondedAt: now,
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
      placeRole: locationResidents.placeRole,
      proposedById: locationResidents.proposedById,
      displayName: users.displayName,
    })
    .from(locationResidents)
    .innerJoin(users, eq(locationResidents.userId, users.id))
    .where(eq(locationResidents.locationId, locationId));

  return mapResidentRows(rows, session?.user?.id);
}

const updatePlaceSchema = placeSchema.extend({
  placeId: z.string().min(1),
});

/**
 * Updates a place (admin only, PC-37).
 */
export async function updatePlaceAction(
  input: z.infer<typeof updatePlaceSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = updatePlaceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const [place] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, parsed.data.placeId))
    .limit(1);
  if (!place) {
    return { ok: false, message: "Place not found." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
  if (!(await userCanEditPlace(db, session.user.id, session.user.role, parsed.data.placeId))) {
    return { ok: false, message: "You can only edit places you created or where you are a resident." };
  }

  if (await isPlaceNameTaken(db, parsed.data.name, parsed.data.placeId)) {
    return { ok: false, message: "A place with this name is already in use." };
  }

  const bedroomNames =
    parsed.data.bedroomNames ??
    Array.from({ length: parsed.data.bedroomCount }, (_, index) => `Bedroom ${index + 1}`);
  const now = new Date().toISOString();

  await db
    .update(locations)
    .set({
      name: parsed.data.name.trim(),
      address: parsed.data.address ?? null,
      description: parsed.data.description ?? null,
      bedroomCount: parsed.data.bedroomCount,
      bedroomNames: JSON.stringify(bedroomNames),
      updatedAt: now,
    })
    .where(eq(locations.id, parsed.data.placeId));

  await logUserActivity(session.user.id, "places.update", parsed.data.placeId);
  revalidatePath("/people-places");

  return { ok: true, message: `Updated place ${parsed.data.name.trim()}.` };
}

/**
 * Deletes a place, reverts linked proposals to drafts, and notifies stakeholders (PC-37).
 */
export async function deletePlaceAction(
  placeId: string,
): Promise<{ ok: boolean; message: string; movedProposalCount?: number }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [place] = await db.select().from(locations).where(eq(locations.id, placeId)).limit(1);
  if (!place) {
    return { ok: false, message: "Place not found." };
  }

  if (!(await userCanDeletePlace(db, session.user.id, session.user.role, placeId))) {
    return { ok: false, message: "You cannot delete this place." };
  }

  const movedProposalCount = await revertProposalsForDeletedPlace(
    db,
    placeId,
    place.name,
    session.user.id,
  );

  await db.delete(locationResidents).where(eq(locationResidents.locationId, placeId));
  await db.delete(locations).where(eq(locations.id, placeId));

  await logUserActivity(
    session.user.id,
    "places.delete",
    JSON.stringify({ placeId, placeName: place.name, movedProposalCount }),
  );
  revalidatePath("/people-places");
  revalidatePath("/proposals");

  const movedSuffix =
    movedProposalCount > 0
      ? ` ${movedProposalCount} proposal(s) moved to drafts and stakeholders notified.`
      : "";

  return {
    ok: true,
    message: `Deleted place ${place.name}.${movedSuffix}`,
    movedProposalCount,
  };
}

/**
 * Owner/admin immediately associates a person as Owner or Resident (PC-187).
 */
export async function addPersonToPlaceAction(
  input: z.infer<typeof addPersonToPlaceSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = addPersonToPlaceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();

  if (
    !(await userIsPlaceOwner(
      db,
      session.user.id,
      session.user.role as UserRole,
      parsed.data.locationId,
    ))
  ) {
    return { ok: false, message: "Only place owners (or admins) can add people." };
  }

  const [place] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, parsed.data.locationId))
    .limit(1);
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.targetUserId))
    .limit(1);
  if (!place || !target || target.status !== "active") {
    return { ok: false, message: "Place or user not found." };
  }

  if (parsed.data.targetUserId === session.user.id) {
    return { ok: false, message: "You are already managing this place." };
  }

  const [existing] = await db
    .select()
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, parsed.data.locationId),
        eq(locationResidents.userId, parsed.data.targetUserId),
      ),
    )
    .limit(1);

  if (existing?.status === "accepted") {
    return { ok: false, message: "User is already associated with this place." };
  }

  const now = new Date().toISOString();
  if (existing) {
    await db
      .update(locationResidents)
      .set({
        status: "accepted",
        placeRole: parsed.data.placeRole,
        proposedById: session.user.id,
        proposalId: null,
        updatedAt: now,
        respondedAt: now,
      })
      .where(eq(locationResidents.id, existing.id));
  } else {
    await db.insert(locationResidents).values({
      id: `lr-${randomUUID()}`,
      locationId: parsed.data.locationId,
      userId: parsed.data.targetUserId,
      status: "accepted",
      placeRole: parsed.data.placeRole,
      proposedById: session.user.id,
      createdAt: now,
      updatedAt: now,
      respondedAt: now,
    });
  }

  const roleLabel = parsed.data.placeRole === "owner" ? "Owner" : "Resident";
  await notifyUser(
    parsed.data.targetUserId,
    "place_member_added",
    `${session.user.displayName ?? "Someone"} added you as ${roleLabel} at ${place.name}.`,
    { url: "/people-places", placeId: place.id },
  );

  await logUserActivity(
    session.user.id,
    "places.add_person",
    JSON.stringify({
      locationId: place.id,
      targetUserId: parsed.data.targetUserId,
      placeRole: parsed.data.placeRole,
      placeName: place.name,
    }),
  );

  revalidatePath("/people-places");
  return {
    ok: true,
    message: `Added ${target.displayName} as ${roleLabel}.`,
  };
}

/**
 * Change an accepted member's place role between owner and resident (PC-193).
 * Authorized for place owners and app admins; refuses demoting the last accepted owner.
 */
export async function updatePlaceMemberRoleAction(
  input: z.infer<typeof updatePlaceMemberRoleSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = updatePlaceMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();

  if (
    !(await userIsPlaceOwner(
      db,
      session.user.id,
      session.user.role as UserRole,
      parsed.data.locationId,
    ))
  ) {
    return { ok: false, message: "Only place owners (or admins) can change access levels." };
  }

  const [place] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, parsed.data.locationId))
    .limit(1);
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.targetUserId))
    .limit(1);
  if (!place || !target || target.status !== "active") {
    return { ok: false, message: "Place or user not found." };
  }

  const [membership] = await db
    .select()
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, parsed.data.locationId),
        eq(locationResidents.userId, parsed.data.targetUserId),
        eq(locationResidents.status, "accepted"),
      ),
    )
    .limit(1);

  if (!membership) {
    return { ok: false, message: "User is not an accepted member of this place." };
  }

  if (membership.placeRole === parsed.data.placeRole) {
    const sameLabel = parsed.data.placeRole === "owner" ? "Owner" : "Resident";
    return { ok: true, message: `${target.displayName} is already ${sameLabel}.` };
  }

  if (membership.placeRole === "owner" && parsed.data.placeRole === "resident") {
    const owners = await db
      .select({ id: locationResidents.id })
      .from(locationResidents)
      .where(
        and(
          eq(locationResidents.locationId, parsed.data.locationId),
          eq(locationResidents.status, "accepted"),
          eq(locationResidents.placeRole, "owner"),
        ),
      );
    if (owners.length <= 1) {
      return {
        ok: false,
        message: "Cannot demote the last owner. Promote another member first.",
      };
    }
  }

  const now = new Date().toISOString();
  await db
    .update(locationResidents)
    .set({ placeRole: parsed.data.placeRole, updatedAt: now })
    .where(eq(locationResidents.id, membership.id));

  const roleLabel = parsed.data.placeRole === "owner" ? "Owner" : "Resident";
  await notifyUser(
    parsed.data.targetUserId,
    "place_member_role_changed",
    `${session.user.displayName ?? "Someone"} set your access at ${place.name} to ${roleLabel}.`,
    { url: "/people-places", placeId: place.id },
  );

  await logUserActivity(
    session.user.id,
    "places.update_member_role",
    JSON.stringify({
      locationId: place.id,
      targetUserId: parsed.data.targetUserId,
      placeRole: parsed.data.placeRole,
      placeName: place.name,
    }),
  );

  revalidatePath("/people-places");
  return {
    ok: true,
    message: `Updated ${target.displayName} to ${roleLabel}.`,
  };
}

/**
 * Remove an accepted place member (PC-199). Immediate — not a proposal.
 * Authorized for place owners and app admins; refuses removing the last accepted owner.
 */
export async function removePersonFromPlaceAction(
  input: z.infer<typeof removePersonFromPlaceSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = removePersonFromPlaceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();

  if (
    !(await userIsPlaceOwner(
      db,
      session.user.id,
      session.user.role as UserRole,
      parsed.data.locationId,
    ))
  ) {
    return { ok: false, message: "Only place owners (or admins) can remove people." };
  }

  const [place] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, parsed.data.locationId))
    .limit(1);
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.targetUserId))
    .limit(1);
  if (!place || !target) {
    return { ok: false, message: "Place or user not found." };
  }

  const [membership] = await db
    .select()
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, parsed.data.locationId),
        eq(locationResidents.userId, parsed.data.targetUserId),
        eq(locationResidents.status, "accepted"),
      ),
    )
    .limit(1);

  if (!membership) {
    return { ok: false, message: "User is not an accepted member of this place." };
  }

  if (membership.placeRole === "owner") {
    const owners = await db
      .select({ id: locationResidents.id })
      .from(locationResidents)
      .where(
        and(
          eq(locationResidents.locationId, parsed.data.locationId),
          eq(locationResidents.status, "accepted"),
          eq(locationResidents.placeRole, "owner"),
        ),
      );
    if (owners.length <= 1) {
      return {
        ok: false,
        message: "Cannot remove the last owner. Promote another member first.",
      };
    }
  }

  await db.delete(locationResidents).where(eq(locationResidents.id, membership.id));

  const roleLabel = membership.placeRole === "owner" ? "Owner" : "Resident";
  await notifyUser(
    parsed.data.targetUserId,
    "place_member_removed",
    `${session.user.displayName ?? "Someone"} removed you as ${roleLabel} from ${place.name}.`,
    { url: "/people-places", placeId: place.id },
  );

  await logUserActivity(
    session.user.id,
    "places.remove_person",
    JSON.stringify({
      locationId: place.id,
      targetUserId: parsed.data.targetUserId,
      placeRole: membership.placeRole,
      placeName: place.name,
    }),
  );

  revalidatePath("/people-places");
  return {
    ok: true,
    message: `Removed ${target.displayName} (${roleLabel}) from ${place.name}.`,
  };
}

/**
 * Self-join residency proposal via standard workflow (PC-188). Prefer addPersonToPlaceAction for owner invites.
 */
export async function proposeResidencyAction(
  locationId: string,
  targetUserId: string,
  placeRole: "owner" | "resident" = "resident",
): Promise<{ ok: boolean; message: string }> {
  const { createResidencyDraftProposalAction } = await import("@/actions/residency-proposals");
  const result = await createResidencyDraftProposalAction({
    locationId,
    targetUserId,
    placeRole,
    submitImmediately: true,
  });
  return { ok: result.ok, message: result.message };
}

/**
 * Accept or decline an incoming residency proposal via the linked standard proposal (PC-60).
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

  if (!row || row.userId !== session.user.id) {
    return { ok: false, message: "Proposal not found." };
  }

  if (row.proposalId) {
    const { castProposalVoteAction } = await import("@/actions/proposals");
    const vote = parsed.data.accept ? "accept" : "decline";
    const result = await castProposalVoteAction({ proposalId: row.proposalId, vote });
    return { ok: result.ok, message: result.message };
  }

  if (row.status !== "proposed") {
    return { ok: false, message: "Proposal not found." };
  }

  return {
    ok: false,
    message: "This legacy residency proposal must be responded to from Proposals.",
  };
}

export interface ResidencyCommentView {
  id: number;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface ResidencyProposalDetail {
  residencyId: string;
  placeName: string;
  inviteeName: string;
  proposerName: string;
  status: string;
  comments: ResidencyCommentView[];
  activityLog: { action: string; details: string | null; createdAt: string }[];
}

const residencyCommentSchema = z.object({
  residencyId: z.string().min(1),
  body: z.string().trim().min(1).max(2000),
});

/**
 * Loads residency proposal detail for the Proposals Kanban dialog (PC-56).
 */
export async function getResidencyProposalDetailAction(
  residencyId: string,
): Promise<{ ok: boolean; message: string; detail?: ResidencyProposalDetail }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      id: locationResidents.id,
      status: locationResidents.status,
      userId: locationResidents.userId,
      proposedById: locationResidents.proposedById,
      placeName: locations.name,
      inviteeName: users.displayName,
    })
    .from(locationResidents)
    .innerJoin(locations, eq(locationResidents.locationId, locations.id))
    .innerJoin(users, eq(locationResidents.userId, users.id))
    .where(eq(locationResidents.id, residencyId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Residency proposal not found." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
  const isParticipant =
    row.userId === session.user.id || row.proposedById === session.user.id;
  if (!isParticipant && !isAdmin) {
    return { ok: false, message: "You cannot view this residency proposal." };
  }

  const [proposer] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.proposedById))
    .limit(1);

  const logRows = await db
    .select({
      action: userActivityLog.action,
      details: userActivityLog.details,
      createdAt: userActivityLog.createdAt,
      userId: userActivityLog.userId,
    })
    .from(userActivityLog)
    .where(like(userActivityLog.details, `%${residencyId}%`))
    .orderBy(asc(userActivityLog.createdAt));

  const authorIds = [...new Set(logRows.map((entry) => entry.userId).filter(Boolean))] as string[];
  const authorRows =
    authorIds.length > 0
      ? await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, authorIds))
      : [];
  const authorMap = new Map(authorRows.map((author) => [author.id, author.displayName]));

  const comments: ResidencyCommentView[] = [];
  const activityLog: ResidencyProposalDetail["activityLog"] = [];

  for (const entry of logRows) {
    if (entry.action === "residency.comment" && entry.details) {
      try {
        const parsed = JSON.parse(entry.details) as { residencyId?: string; body?: string };
        if (parsed.residencyId === residencyId && parsed.body) {
          comments.push({
            id: comments.length + 1,
            authorName: authorMap.get(entry.userId ?? "") ?? "Someone",
            body: parsed.body,
            createdAt: entry.createdAt,
          });
        }
      } catch {
        // skip malformed
      }
    }
    activityLog.push({
      action: entry.action,
      details: formatActivityLogDetails(entry.action, entry.details),
      createdAt: entry.createdAt,
    });
  }

  return {
    ok: true,
    message: "OK",
    detail: {
      residencyId: row.id,
      placeName: row.placeName,
      inviteeName: row.inviteeName,
      proposerName: proposer?.displayName ?? "Someone",
      status: row.status,
      comments,
      activityLog,
    },
  };
}

/**
 * Adds a comment to a residency proposal thread (PC-56).
 */
export async function addResidencyCommentAction(
  input: z.infer<typeof residencyCommentSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = residencyCommentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid comment." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(locationResidents)
    .where(eq(locationResidents.id, parsed.data.residencyId))
    .limit(1);

  if (!row || row.status === "accepted") {
    return { ok: false, message: "Cannot comment on this residency proposal." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
  const isParticipant =
    row.userId === session.user.id || row.proposedById === session.user.id;
  if (!isParticipant && !isAdmin) {
    return { ok: false, message: "You cannot comment on this residency proposal." };
  }

  await logUserActivity(
    session.user.id,
    "residency.comment",
    JSON.stringify({ residencyId: parsed.data.residencyId, body: parsed.data.body }),
  );

  const [author] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const notifyTargetId =
    session.user.id === row.userId ? row.proposedById : row.userId;
  await notifyUser(
    notifyTargetId,
    "residency_comment",
    `${author?.displayName ?? "Someone"} commented on residency at your proposal.`,
    { residencyId: row.id },
  );

  revalidatePath("/proposals");
  return { ok: true, message: "Comment posted." };
}

/**
 * Removes a declined residency draft so the proposer can re-associate (PC-56).
 */
export async function deleteDeclinedResidencyAction(
  residencyId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(locationResidents)
    .where(eq(locationResidents.id, residencyId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Declined residency draft not found." };
  }

  if (row.proposalId) {
    const { deleteDraftProposalAction } = await import("@/actions/proposals");
    return deleteDraftProposalAction(row.proposalId);
  }

  if (row.status !== "declined") {
    return { ok: false, message: "Declined residency draft not found." };
  }

  const isAdmin = await userHasAdminAccess(session.user.role);
  if (!isAdmin && row.proposedById !== session.user.id) {
    return { ok: false, message: "Only the proposer can remove this draft." };
  }

  await db.delete(locationResidents).where(eq(locationResidents.id, residencyId));
  await logUserActivity(
    session.user.id,
    "places.delete_declined_residency",
    JSON.stringify({ residencyId }),
  );
  revalidatePath("/people-places");
  revalidatePath("/proposals");

  return { ok: true, message: "Declined residency draft removed." };
}
