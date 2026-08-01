"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userHasAdminAccess } from "@/lib/admin-access";
import { logUserActivity } from "@/lib/audit";
import { dismissNotificationsForPartnership } from "@/actions/notifications";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { sleepingPartnerships, users } from "@/lib/db/schema";
import { requireNetworkSession } from "@/lib/networks/context";
import { getMembership } from "@/lib/networks/membership";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { canonicalUserPair } from "@/lib/users/pair";
import { notifyUser } from "@/lib/notifications";
import { notifySleepingNetworkOfPartnershipChange } from "@/lib/partnerships/network-notify";
import { LONG_TEXT_MAX, limitedString } from "@/lib/validation/string-limits";

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
  comment: limitedString("Comment", LONG_TEXT_MAX).optional(),
});

async function assertPartnershipInActiveNetwork(
  partnershipId: string,
  networkId: string,
): Promise<
  | { ok: true; row: typeof sleepingPartnerships.$inferSelect }
  | { ok: false; message: string }
> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(sleepingPartnerships)
    .where(eq(sleepingPartnerships.id, partnershipId))
    .limit(1);
  if (!row || row.networkId !== networkId) {
    return { ok: false, message: "Partnership not found." };
  }
  return { ok: true, row };
}

/**
 * Lists sleeping partnerships for a user in the active network (PC-36 / PC-364).
 */
export async function listPartnershipsForUserAction(
  userId: string,
): Promise<PartnershipView[]> {
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return [];
  }

  const isAdmin = await userHasAdminAccess(networkSession.user.role);
  if (networkSession.user.id !== userId && !isAdmin) {
    throw new Error("Forbidden");
  }

  const networkId = networkSession.user.activeNetworkId;
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
      and(
        eq(sleepingPartnerships.networkId, networkId),
        or(
          eq(sleepingPartnerships.userLowId, userId),
          eq(sleepingPartnerships.userHighId, userId),
        ),
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
    .from(users)
    .where(inArray(users.id, partnerIds));

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
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return { ok: false, message: networkSession.message };
  }

  const proposerId =
    subjectUserId && networkSession.user.role === "admin"
      ? subjectUserId
      : networkSession.user.id;

  if (targetUserId === proposerId) {
    return { ok: false, message: "You cannot partner with yourself." };
  }

  const networkId = networkSession.user.activeNetworkId;
  const targetMembership = await getMembership(targetUserId, networkId);
  if (!targetMembership) {
    return { ok: false, message: "User is not a member of this network." };
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
        eq(sleepingPartnerships.networkId, networkId),
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
  if (existing?.status === "declined") {
    return {
      ok: false,
      message: "This sleeping partnership was declined and cannot be resubmitted.",
    };
  }

  const now = new Date().toISOString();
  const autoAccept = target.role === "passive";
  const status = autoAccept ? "accepted" : "proposed";
  const partnershipId = existing?.id ?? `sp-${randomUUID()}`;
  const initiatedByUserId =
    subjectUserId && networkSession.user.id !== proposerId
      ? networkSession.user.id
      : null;

  if (existing) {
    await db
      .update(sleepingPartnerships)
      .set({
        status,
        proposedById: proposerId,
        initiatedByUserId,
        updatedAt: now,
        respondedAt: autoAccept ? now : null,
        passiveAutoAccepted: autoAccept,
      })
      .where(eq(sleepingPartnerships.id, existing.id));
  } else {
    await db.insert(sleepingPartnerships).values({
      id: partnershipId,
      networkId,
      userLowId,
      userHighId,
      status,
      proposedById: proposerId,
      initiatedByUserId,
      createdAt: now,
      updatedAt: now,
      respondedAt: autoAccept ? now : null,
      passiveAutoAccepted: autoAccept,
    });
  }

  const [proposer] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, proposerId))
    .limit(1);

  await logUserActivity(
    networkSession.user.id,
    "partnership.propose",
    JSON.stringify({ targetUserId, status, networkId }),
  );

  if (!autoAccept) {
    await notifyUser(
      targetUserId,
      "partnership_proposed",
      `${proposer?.displayName ?? "Someone"} proposed a sleeping partnership with you.`,
      { partnershipId, proposerId, partnerId: targetUserId },
    );
  } else {
    await notifySleepingNetworkOfPartnershipChange(
      db,
      userLowId,
      userHighId,
      `${proposer?.displayName ?? "Someone"} established a sleeping partnership with ${target.displayName}.`,
      { partnershipId, userLowId, userHighId },
    );
  }

  revalidatePath("/people-places");
  revalidatePath("/proposals");

  return {
    ok: true,
    message: autoAccept
      ? `Sleeping partnership with ${target.displayName} established.`
      : `Partnership proposal sent to ${target.displayName}.`,
  };
}

/**
 * Withdraws a pending partnership proposal (proposer only).
 */
export async function withdrawPartnershipProposalAction(
  partnershipId: string,
): Promise<{ ok: boolean; message: string }> {
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return { ok: false, message: networkSession.message };
  }

  const lookup = await assertPartnershipInActiveNetwork(
    partnershipId,
    networkSession.user.activeNetworkId,
  );
  if (!lookup.ok) return lookup;
  const row = lookup.row;

  if (row.status !== "proposed") {
    return { ok: false, message: "Proposal not found." };
  }

  if (row.proposedById !== networkSession.user.id) {
    return { ok: false, message: "Only the proposer can withdraw this proposal." };
  }

  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(sleepingPartnerships)
    .set({ status: "declined", updatedAt: now, respondedAt: now })
    .where(eq(sleepingPartnerships.id, row.id));

  const partnerId =
    row.userLowId === networkSession.user.id ? row.userHighId : row.userLowId;
  const [proposer] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, networkSession.user.id))
    .limit(1);

  await notifyUser(
    partnerId,
    "partnership_withdrawn",
    `${proposer?.displayName ?? "Someone"} withdrew their sleeping partnership proposal.`,
    { partnershipId: row.id },
  );

  await logUserActivity(networkSession.user.id, "partnership.withdraw", row.id);
  revalidatePath("/people-places");
  revalidatePath("/proposals");

  return { ok: true, message: "Partnership proposal withdrawn." };
}

/**
 * Accept or decline an incoming sleeping partnership proposal (PC-36).
 */
export async function respondPartnershipAction(
  input: z.infer<typeof respondSchema>,
): Promise<{ ok: boolean; message: string }> {
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return { ok: false, message: networkSession.message };
  }

  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid request." };
  }

  const lookup = await assertPartnershipInActiveNetwork(
    parsed.data.partnershipId,
    networkSession.user.activeNetworkId,
  );
  if (!lookup.ok) return lookup;
  const row = lookup.row;

  if (row.status !== "proposed") {
    return { ok: false, message: "Proposal not found." };
  }

  const isParticipant =
    row.userLowId === networkSession.user.id || row.userHighId === networkSession.user.id;
  if (!isParticipant || row.proposedById === networkSession.user.id) {
    return { ok: false, message: "You cannot respond to this proposal." };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const status = parsed.data.accept ? "accepted" : "declined";

  await db
    .update(sleepingPartnerships)
    .set({ status, updatedAt: now, respondedAt: now })
    .where(eq(sleepingPartnerships.id, row.id));

  const partnerId =
    row.userLowId === networkSession.user.id ? row.userHighId : row.userLowId;
  const [responder] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, networkSession.user.id))
    .limit(1);
  const [lowUser] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.userLowId))
    .limit(1);
  const [highUser] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.userHighId))
    .limit(1);
  const lowName = lowUser?.displayName ?? "a member";
  const highName = highUser?.displayName ?? "a member";

  await notifyUser(
    row.proposedById,
    parsed.data.accept ? "partnership_accepted" : "partnership_declined",
    `${responder?.displayName ?? "Someone"} ${parsed.data.accept ? "accepted" : "declined"} your sleeping partnership proposal.`,
    { partnershipId: row.id, partnerId },
  );

  if (parsed.data.accept) {
    await notifySleepingNetworkOfPartnershipChange(
      db,
      row.userLowId,
      row.userHighId,
      `${responder?.displayName ?? "Someone"} accepted the sleeping partnership between ${lowName} and ${highName}.`,
      { partnershipId: row.id, userLowId: row.userLowId, userHighId: row.userHighId },
    );
  }

  await logUserActivity(
    networkSession.user.id,
    parsed.data.accept ? "partnership.accept" : "partnership.decline",
    JSON.stringify({
      partnershipId: row.id,
      lowName,
      highName,
      responderName: responder?.displayName,
      comment: parsed.data.comment ?? null,
    }),
  );

  if (parsed.data.comment?.trim()) {
    await logUserActivity(
      networkSession.user.id,
      "partnership.comment",
      JSON.stringify({ partnershipId: row.id, body: parsed.data.comment.trim() }),
    );
  }

  // Clear actionable inbox rows even when Accept/Decline happens outside the bell (PC-349).
  await dismissNotificationsForPartnership(networkSession.user.id, row.id);

  revalidatePath("/people-places");
  revalidatePath("/proposals");

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
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) {
    return { ok: false, message: networkSession.message };
  }

  const lookup = await assertPartnershipInActiveNetwork(
    partnershipId,
    networkSession.user.activeNetworkId,
  );
  if (!lookup.ok) return lookup;
  const row = lookup.row;

  const isParticipant =
    row.userLowId === networkSession.user.id || row.userHighId === networkSession.user.id;
  const isAdmin = networkSession.user.role === "admin";
  if (!isParticipant && !isAdmin) {
    return { ok: false, message: "Not allowed." };
  }

  const db = getDb();
  const [lowUser] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.userLowId))
    .limit(1);
  const [highUser] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, row.userHighId))
    .limit(1);
  const [actor] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, networkSession.user.id))
    .limit(1);

  await db.delete(sleepingPartnerships).where(eq(sleepingPartnerships.id, partnershipId));

  if (row.status === "accepted") {
    await notifySleepingNetworkOfPartnershipChange(
      db,
      row.userLowId,
      row.userHighId,
      `${actor?.displayName ?? "Someone"} removed the sleeping partnership between ${lowUser?.displayName ?? "a member"} and ${highUser?.displayName ?? "a member"}.`,
      { partnershipId, userLowId: row.userLowId, userHighId: row.userHighId },
    );
  }

  await logUserActivity(networkSession.user.id, "partnership.remove", partnershipId);
  revalidatePath("/people-places");

  return { ok: true, message: "Sleeping partnership removed." };
}

export interface SleepingPartnershipMapEdge {
  userLowId: string;
  userHighId: string;
  lowName: string;
  highName: string;
  lowAvatarKey: string | null;
  highAvatarKey: string | null;
}

/**
 * Accepted partnership edges for the People & Places Sleeping Partners tab (PC-73 / PC-180).
 */
export async function listSleepingPartnershipMapEdgesAction(): Promise<SleepingPartnershipMapEdge[]> {
  const networkSession = await requireNetworkSession();
  if (!networkSession.ok) return [];

  await ensureDbReady();
  const db = getDb();
  const settings = await loadNetworkSettings(networkSession.user.activeNetworkId, db);
  const visibility = settings?.placesMapVisibility ?? "all";
  const isAdmin = await userHasAdminAccess(networkSession.user.role);
  if (visibility === "none") return [];
  if (visibility === "admins" && !isAdmin) return [];

  const rows = await db
    .select({
      userLowId: sleepingPartnerships.userLowId,
      userHighId: sleepingPartnerships.userHighId,
    })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.networkId, networkSession.user.activeNetworkId),
        eq(sleepingPartnerships.status, "accepted"),
      ),
    );

  if (rows.length === 0) return [];

  const userIds = new Set<string>();
  for (const row of rows) {
    userIds.add(row.userLowId);
    userIds.add(row.userHighId);
  }

  const userRows = await db
    .select({ id: users.id, displayName: users.displayName, avatarKey: users.avatarKey })
    .from(users)
    .where(inArray(users.id, [...userIds]));

  const nameById = new Map(userRows.map((row) => [row.id, row.displayName]));
  const avatarById = new Map(userRows.map((row) => [row.id, row.avatarKey]));

  return rows.map((row) => ({
    userLowId: row.userLowId,
    userHighId: row.userHighId,
    lowName: nameById.get(row.userLowId) ?? "Member",
    highName: nameById.get(row.userHighId) ?? "Member",
    lowAvatarKey: avatarById.get(row.userLowId) ?? null,
    highAvatarKey: avatarById.get(row.userHighId) ?? null,
  }));
}
