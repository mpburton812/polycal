"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  locationResidents,
  locations,
  proposalInvitees,
  proposalStateLog,
  proposals,
  users,
} from "@/lib/db/schema";
import { notifyUser } from "@/lib/notifications";
import { serializeResidencyProposalMeta } from "@/lib/proposals/special-proposals";
import type { UserRole } from "@/types/user";

const residencyDraftSchema = z.object({
  locationId: z.string().min(1),
  targetUserId: z.string().min(1),
  /** When true, immediately submits the draft (People & Places associate flow). */
  submitImmediately: z.boolean().optional(),
});

/**
 * Validates whether the signed-in user may propose residency at a place for a target user.
 */
async function assertResidencyProposalAllowed(
  db: ReturnType<typeof getDb>,
  proposerId: string,
  proposerRole: UserRole,
  locationId: string,
  targetUserId: string,
): Promise<{ ok: true; placeName: string; targetName: string } | { ok: false; message: string }> {
  if (!(await userHasAdminAccess(proposerRole)) && targetUserId !== proposerId) {
    return { ok: false, message: "You can only associate yourself with a place." };
  }

  const [place] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!place || !target || target.status !== "active") {
    return { ok: false, message: "Place or user not found." };
  }

  const isAdmin = await userHasAdminAccess(proposerRole);
  if (!isAdmin && place.createdById !== proposerId) {
    return { ok: false, message: "You cannot associate with this place." };
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

  if (existing?.status === "proposed" && existing.proposalId) {
    return { ok: false, message: "A residency proposal is already pending." };
  }

  return { ok: true, placeName: place.name, targetName: target.displayName };
}

/**
 * Creates a residency draft proposal (standard workflow) for a place invitee (PC-60).
 */
export async function createResidencyDraftProposalAction(
  input: z.infer<typeof residencyDraftSchema>,
): Promise<{ ok: boolean; message: string; proposalId?: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = residencyDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await ensureDbReady();
  const db = getDb();
  const allowed = await assertResidencyProposalAllowed(
    db,
    session.user.id,
    session.user.role as UserRole,
    parsed.data.locationId,
    parsed.data.targetUserId,
  );
  if (!allowed.ok) {
    return { ok: false, message: allowed.message };
  }

  const now = new Date().toISOString();
  const proposalId = `prop-${randomUUID()}`;
  const title = `Residency at ${allowed.placeName}`;
  const description = serializeResidencyProposalMeta({
    residencyProposal: true,
    targetUserId: parsed.data.targetUserId,
  });

  await db.insert(proposals).values({
    id: proposalId,
    title,
    description,
    proposalType: "event",
    state: "draft",
    proposerId: session.user.id,
    locationId: parsed.data.locationId,
    eventPrivacy: "open",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(proposalInvitees).values({
    id: `pi-${randomUUID()}`,
    proposalId,
    userId: parsed.data.targetUserId,
    role: "required",
    voteStatus: "not_seen",
    createdAt: now,
  });

  await db.insert(proposalStateLog).values({
    id: `psl-${randomUUID()}`,
    proposalId,
    actorUserId: session.user.id,
    action: "draft.created",
    details: JSON.stringify({ kind: "residency", locationId: parsed.data.locationId }),
    createdAt: now,
  });

  await logUserActivity(
    session.user.id,
    "places.propose_residency",
    JSON.stringify({
      locationId: parsed.data.locationId,
      targetUserId: parsed.data.targetUserId,
      proposalId,
      status: "draft",
      placeName: allowed.placeName,
    }),
  );

  revalidatePath("/people-places");
  revalidatePath("/proposals");

  if (parsed.data.submitImmediately) {
    const { submitProposalAction } = await import("@/actions/proposals");
    const submitResult = await submitProposalAction(proposalId, true);
    if (!submitResult.ok) {
      return { ok: false, message: submitResult.message, proposalId };
    }
    return {
      ok: true,
      message: `Residency proposal sent to ${allowed.targetName}.`,
      proposalId,
    };
  }

  return {
    ok: true,
    message: "Residency draft saved. Submit from Proposals when ready.",
    proposalId,
  };
}

/**
 * Applies accepted residency when a residency proposal resolves (PC-60).
 */
export async function applyResidencyProposalResolution(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  actorUserId: string,
): Promise<void> {
  if (!proposal.description || !proposal.locationId) return;

  const meta = JSON.parse(proposal.description) as {
    residencyProposal?: boolean;
    targetUserId?: string;
    locationResidentsId?: string;
  };
  if (!meta.residencyProposal || !meta.targetUserId) return;

  const now = new Date().toISOString();
  let residencyId = meta.locationResidentsId;

  if (residencyId) {
    await db
      .update(locationResidents)
      .set({
        status: "accepted",
        updatedAt: now,
        respondedAt: now,
        proposalId: proposal.id,
      })
      .where(eq(locationResidents.id, residencyId));
  } else {
    const [existing] = await db
      .select()
      .from(locationResidents)
      .where(
        and(
          eq(locationResidents.locationId, proposal.locationId),
          eq(locationResidents.userId, meta.targetUserId),
        ),
      )
      .limit(1);

    if (existing) {
      residencyId = existing.id;
      await db
        .update(locationResidents)
        .set({
          status: "accepted",
          proposedById: proposal.proposerId,
          updatedAt: now,
          respondedAt: now,
          proposalId: proposal.id,
        })
        .where(eq(locationResidents.id, existing.id));
    } else {
      residencyId = `lr-${randomUUID()}`;
      await db.insert(locationResidents).values({
        id: residencyId,
        locationId: proposal.locationId,
        userId: meta.targetUserId,
        status: "accepted",
        proposedById: proposal.proposerId,
        proposalId: proposal.id,
        createdAt: now,
        updatedAt: now,
        respondedAt: now,
      });
    }
  }

  await db
    .update(proposals)
    .set({
      description: serializeResidencyProposalMeta({
        residencyProposal: true,
        targetUserId: meta.targetUserId,
        locationResidentsId: residencyId,
      }),
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));

  const [place] = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, proposal.locationId))
    .limit(1);
  const [responder] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);

  await logUserActivity(
    actorUserId,
    "places.accept_residency",
    JSON.stringify({
      proposalId: proposal.id,
      residencyId,
      placeName: place?.name,
      inviteeName: responder?.displayName,
      accept: true,
    }),
  );

  revalidatePath("/people-places");
}

/**
 * Ensures a pending location_residents row exists when a residency proposal is submitted (PC-60).
 */
export async function syncResidencyRowOnSubmit(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
): Promise<void> {
  if (!proposal.description || !proposal.locationId) return;

  const meta = JSON.parse(proposal.description) as {
    residencyProposal?: boolean;
    targetUserId?: string;
    locationResidentsId?: string;
  };
  if (!meta.residencyProposal || !meta.targetUserId) return;

  const now = new Date().toISOString();
  let residencyId = meta.locationResidentsId;

  const [existing] = await db
    .select()
    .from(locationResidents)
    .where(
      and(
        eq(locationResidents.locationId, proposal.locationId),
        eq(locationResidents.userId, meta.targetUserId),
      ),
    )
    .limit(1);

  if (existing) {
    residencyId = existing.id;
    await db
      .update(locationResidents)
      .set({
        status: "proposed",
        proposedById: proposal.proposerId,
        proposalId: proposal.id,
        updatedAt: now,
        respondedAt: null,
      })
      .where(eq(locationResidents.id, existing.id));
  } else {
    residencyId = `lr-${randomUUID()}`;
    await db.insert(locationResidents).values({
      id: residencyId,
      locationId: proposal.locationId,
      userId: meta.targetUserId,
      status: "proposed",
      proposedById: proposal.proposerId,
      proposalId: proposal.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db
    .update(proposals)
    .set({
      description: serializeResidencyProposalMeta({
        residencyProposal: true,
        targetUserId: meta.targetUserId,
        locationResidentsId: residencyId,
      }),
      updatedAt: now,
    })
    .where(eq(proposals.id, proposal.id));
}

/**
 * Clears or removes residency linkage when a residency draft is deleted or reverted (PC-60).
 */
export async function cleanupResidencyProposalLinkage(
  db: ReturnType<typeof getDb>,
  proposal: typeof proposals.$inferSelect,
  removeProposedRow: boolean,
): Promise<void> {
  if (!proposal.description) return;

  const meta = JSON.parse(proposal.description) as {
    residencyProposal?: boolean;
    locationResidentsId?: string;
  };
  if (!meta.residencyProposal || !meta.locationResidentsId) return;

  if (removeProposedRow) {
    await db
      .delete(locationResidents)
      .where(
        and(
          eq(locationResidents.id, meta.locationResidentsId),
          eq(locationResidents.status, "proposed"),
        ),
      );
    return;
  }

  await db
    .update(locationResidents)
    .set({ proposalId: null, updatedAt: new Date().toISOString() })
    .where(eq(locationResidents.id, meta.locationResidentsId));
}

/**
 * Migrates legacy location_residents proposed/declined rows into standard proposals (PC-60).
 */
export async function bridgeLegacyResidencyProposals(
  db: ReturnType<typeof getDb>,
): Promise<void> {
  const legacyRows = await db
    .select({
      id: locationResidents.id,
      locationId: locationResidents.locationId,
      userId: locationResidents.userId,
      proposedById: locationResidents.proposedById,
      status: locationResidents.status,
      placeName: locations.name,
    })
    .from(locationResidents)
    .innerJoin(locations, eq(locationResidents.locationId, locations.id))
    .where(
      and(
        inArray(locationResidents.status, ["proposed", "declined"]),
        isNull(locationResidents.proposalId),
      ),
    );

  for (const row of legacyRows) {
    const now = new Date().toISOString();
    const proposalId = `prop-${randomUUID()}`;
    const state = row.status === "declined" ? "draft" : "proposed";

    await db.insert(proposals).values({
      id: proposalId,
      title: `Residency at ${row.placeName}`,
      description: serializeResidencyProposalMeta({
        residencyProposal: true,
        targetUserId: row.userId,
        locationResidentsId: row.id,
      }),
      proposalType: "event",
      state,
      proposerId: row.proposedById,
      locationId: row.locationId,
      eventPrivacy: "open",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(proposalInvitees).values({
      id: `pi-${randomUUID()}`,
      proposalId,
      userId: row.userId,
      role: "required",
      voteStatus: row.status === "declined" ? "decline" : "not_seen",
      createdAt: now,
      respondedAt: row.status === "declined" ? now : null,
    });

    await db.insert(proposalStateLog).values({
      id: `psl-${randomUUID()}`,
      proposalId,
      actorUserId: row.proposedById,
      action: "legacy.residency_migrated",
      details: row.id,
      createdAt: now,
    });

    await db
      .update(locationResidents)
      .set({ proposalId, updatedAt: now })
      .where(eq(locationResidents.id, row.id));
  }
}
