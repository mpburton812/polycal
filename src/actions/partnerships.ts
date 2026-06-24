"use server";

import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { sleepingPartnerships, users } from "@/lib/db/schema";
import { canonicalUserPair } from "@/lib/users/pair";

export interface PartnershipView {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerRole: string;
  status: string;
  proposedById: string;
  isIncoming: boolean;
}

const respondSchema = z.object({
  partnershipId: z.string().min(1),
  accept: z.boolean(),
});

/**
 * Lists sleeping partnerships for a user, including pending incoming proposals (PC-36).
 */
export async function listPartnershipsForUserAction(
  userId: string,
): Promise<PartnershipView[]> {
  await ensureDbReady();
  const db = getDb();

  const rows = await db
    .select({
      id: sleepingPartnerships.id,
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
      status: sleepingPartnerships.status,
      proposedById: sleepingPartnerships.proposedById,
    })
    .from(sleepingPartnerships)
    .where(
      or(
        eq(sleepingPartnerships.userLowId, userId),
        eq(sleepingPartnerships.userHighId, userId),
      ),
    );

  const partnerIds = rows.map((row) =>
    row.userLowId === userId ? row.userHighId : row.userLowId,
  );
  if (partnerIds.length === 0) return [];

  const partnerRows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users);

  const partnerMap = new Map(partnerRows.map((row) => [row.id, row]));

  const views: PartnershipView[] = [];
  for (const row of rows) {
    const partnerId = row.userLowId === userId ? row.userHighId : row.userLowId;
    const partner = partnerMap.get(partnerId);
    if (!partner) continue;
    views.push({
      id: row.id,
      partnerId,
      partnerName: partner.displayName,
      partnerRole: partner.role,
      status: row.status,
      proposedById: row.proposedById,
      isIncoming: row.status === "proposed" && row.proposedById !== userId,
    });
  }
  return views;
}

/**
 * Proposes a sleeping partnership; passive targets auto-accept (PC-36).
 */
export async function proposePartnershipAction(
  targetUserId: string,
  subjectUserId?: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const proposerId =
    subjectUserId && session.user.role === "admin" ? subjectUserId : session.user.id;

  if (targetUserId === proposerId) {
    return { ok: false, message: "You cannot partner with yourself." };
  }

  await ensureDbReady();
  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target || target.status !== "active") {
    return { ok: false, message: "User not found." };
  }

  const [userLowId, userHighId] = canonicalUserPair(proposerId, targetUserId);
  const [existing] = await db
    .select()
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.userLowId, userLowId),
        eq(sleepingPartnerships.userHighId, userHighId),
      ),
    )
    .limit(1);

  if (existing?.status === "accepted") {
    return { ok: false, message: "You are already sleeping partners." };
  }
  if (existing?.status === "proposed") {
    return { ok: false, message: "A partnership proposal is already pending." };
  }

  const now = new Date().toISOString();
  const autoAccept = target.role === "passive";
  const status = autoAccept ? "accepted" : "proposed";

  if (existing) {
    await db
      .update(sleepingPartnerships)
      .set({
        status,
        proposedById: proposerId,
        updatedAt: now,
        respondedAt: autoAccept ? now : null,
        passiveAutoAccepted: autoAccept,
      })
      .where(eq(sleepingPartnerships.id, existing.id));
  } else {
    await db.insert(sleepingPartnerships).values({
      id: `sp-${randomUUID()}`,
      userLowId,
      userHighId,
      status,
      proposedById: proposerId,
      createdAt: now,
      updatedAt: now,
      respondedAt: autoAccept ? now : null,
      passiveAutoAccepted: autoAccept,
    });
  }

  await logUserActivity(
    session.user.id,
    "partnership.propose",
    JSON.stringify({ targetUserId, status }),
  );

  revalidatePath("/people-places");

  return {
    ok: true,
    message: autoAccept
      ? `Sleeping partnership with ${target.displayName} established.`
      : `Partnership proposal sent to ${target.displayName}.`,
  };
}

/**
 * Accept or decline an incoming sleeping partnership proposal (PC-36).
 */
export async function respondPartnershipAction(
  input: z.infer<typeof respondSchema>,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid request." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(sleepingPartnerships)
    .where(eq(sleepingPartnerships.id, parsed.data.partnershipId))
    .limit(1);

  if (!row || row.status !== "proposed") {
    return { ok: false, message: "Proposal not found." };
  }

  const isParticipant =
    row.userLowId === session.user.id || row.userHighId === session.user.id;
  if (!isParticipant || row.proposedById === session.user.id) {
    return { ok: false, message: "You cannot respond to this proposal." };
  }

  const now = new Date().toISOString();
  const status = parsed.data.accept ? "accepted" : "declined";

  await db
    .update(sleepingPartnerships)
    .set({ status, updatedAt: now, respondedAt: now })
    .where(eq(sleepingPartnerships.id, row.id));

  await logUserActivity(
    session.user.id,
    parsed.data.accept ? "partnership.accept" : "partnership.decline",
    row.id,
  );

  revalidatePath("/people-places");

  return {
    ok: true,
    message: parsed.data.accept ? "Partnership accepted." : "Partnership declined.",
  };
}

/**
 * Removes an accepted sleeping partnership (PC-36 foundation).
 */
export async function removePartnershipAction(
  partnershipId: string,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(sleepingPartnerships)
    .where(eq(sleepingPartnerships.id, partnershipId))
    .limit(1);

  if (!row) {
    return { ok: false, message: "Partnership not found." };
  }

  const isParticipant =
    row.userLowId === session.user.id || row.userHighId === session.user.id;
  const isAdmin = session.user.role === "admin";
  if (!isParticipant && !isAdmin) {
    return { ok: false, message: "Not allowed." };
  }

  await db.delete(sleepingPartnerships).where(eq(sleepingPartnerships.id, partnershipId));
  await logUserActivity(session.user.id, "partnership.remove", partnershipId);
  revalidatePath("/people-places");

  return { ok: true, message: "Sleeping partnership removed." };
}
