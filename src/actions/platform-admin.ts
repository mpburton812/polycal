"use server";

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import {
  networkMembers,
  networks,
  proposals,
  userActivityLog,
  users,
} from "@/lib/db/schema";
import {
  removeAllMemberships,
  upsertMembership,
} from "@/lib/networks/membership";
import { requirePlatformAdmin } from "@/lib/networks/context";
import { formatUserRole } from "@/lib/users/role-labels";
import {
  moderationExpiresFromDays,
} from "@/lib/users/moderation";
import { LONG_TEXT_MAX, maxCharsMessage } from "@/lib/validation/string-limits";

const moderationInputSchema = z.object({
  userId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required.")
    .max(LONG_TEXT_MAX, maxCharsMessage("Reason", LONG_TEXT_MAX)),
  durationDays: z.number().int().positive().optional(),
});

export interface PlatformNetworkMemberRow {
  userId: string;
  username: string;
  displayName: string;
  networkRole: string;
  userRole: string;
  status: string;
}

export interface PlatformNetworkDetailReport {
  networkId: string;
  networkName: string;
  networkStatus: string;
  memberCount: number;
  members: PlatformNetworkMemberRow[];
  calendarEventCount: number;
  kanbanCounts: {
    draft: number;
    proposed: number;
    resolved: number;
    archived: number;
  };
  dailyLogins: { date: string; count: number }[];
}

export interface PlatformUserRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  networks: { networkId: string; name: string; role: string }[];
  moderationReason: string | null;
  moderationExpiresAt: string | null;
}

/**
 * Per-network operator report: members, calendar events, kanban counts, logins (PC-362).
 */
export async function getNetworkDetailReportAction(
  networkId: string,
): Promise<{ ok: true; report: PlatformNetworkDetailReport } | { ok: false; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };

  await ensureDbReady();
  const db = getDb();
  const [network] = await db.select().from(networks).where(eq(networks.id, networkId)).limit(1);
  if (!network) return { ok: false, message: "Network not found." };

  const memberRows = await db
    .select({
      userId: networkMembers.userId,
      networkRole: networkMembers.role,
      username: users.username,
      displayName: users.displayName,
      userRole: users.role,
      status: users.status,
    })
    .from(networkMembers)
    .innerJoin(users, eq(networkMembers.userId, users.id))
    .where(
      and(eq(networkMembers.networkId, networkId), eq(networkMembers.status, "active")),
    );

  const stateRows = await db
    .select({
      state: proposals.state,
      count: sql<number>`count(*)`,
    })
    .from(proposals)
    .where(eq(proposals.networkId, networkId))
    .groupBy(proposals.state);

  const kanbanCounts = { draft: 0, proposed: 0, resolved: 0, archived: 0 };
  for (const row of stateRows) {
    const key = row.state as keyof typeof kanbanCounts;
    if (key in kanbanCounts) {
      kanbanCounts[key] = Number(row.count);
    }
  }

  const [calendarRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(proposals)
    .where(
      and(
        eq(proposals.networkId, networkId),
        inArray(proposals.state, ["resolved", "archived"]),
        sql`${proposals.scheduledStartAt} IS NOT NULL`,
      ),
    );

  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);
  const memberIds = memberRows.map((row) => row.userId);
  let dailyLogins: { date: string; count: number }[] = [];
  if (memberIds.length > 0) {
    const loginRows = await db
      .select({
        day: sql<string>`substr(${userActivityLog.createdAt}, 1, 10)`,
        count: sql<number>`count(*)`,
      })
      .from(userActivityLog)
      .where(
        and(
          eq(userActivityLog.action, "login"),
          gte(userActivityLog.createdAt, since.toISOString()),
          inArray(userActivityLog.userId, memberIds),
        ),
      )
      .groupBy(sql`substr(${userActivityLog.createdAt}, 1, 10)`)
      .orderBy(sql`substr(${userActivityLog.createdAt}, 1, 10)`);

    dailyLogins = loginRows.map((row) => ({
      date: String(row.day),
      count: Number(row.count),
    }));
  }

  return {
    ok: true,
    report: {
      networkId: network.id,
      networkName: network.name,
      networkStatus: network.status,
      memberCount: memberRows.length,
      members: memberRows.map((row) => ({
        userId: row.userId,
        username: row.username,
        displayName: row.displayName,
        networkRole: row.networkRole,
        userRole: formatUserRole(row.userRole),
        status: row.status,
      })),
      calendarEventCount: Number(calendarRow?.count ?? 0),
      kanbanCounts,
      dailyLogins,
    },
  };
}

/**
 * Ensures platform operator membership and returns context for inhabiting network admin (PC-362).
 */
export async function inhabitNetworkAdminAction(
  networkId: string,
): Promise<{ ok: boolean; message: string; networkId?: string; networkName?: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };

  await ensureDbReady();
  const db = getDb();
  const [network] = await db.select().from(networks).where(eq(networks.id, networkId)).limit(1);
  if (!network) return { ok: false, message: "Network not found." };

  await upsertMembership({
    networkId,
    userId: admin.user.id,
    role: "network_admin",
  });

  await logUserActivity(
    admin.user.id,
    "platform.inhabit_network",
    JSON.stringify({ networkId, networkName: network.name }),
  );

  return {
    ok: true,
    message: `Inhabiting admin for ${network.name}.`,
    networkId: network.id,
    networkName: network.name,
  };
}

/**
 * Lists every platform user with network memberships for the operator console (PC-362).
 */
export async function listPlatformUsersAction(): Promise<PlatformUserRow[]> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return [];

  await ensureDbReady();
  const db = getDb();
  const userRows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      status: users.status,
      moderationReason: users.moderationReason,
      moderationExpiresAt: users.moderationExpiresAt,
    })
    .from(users)
    .where(sql`${users.status} != 'deleted'`)
    .orderBy(users.displayName);

  const membershipRows = await db
    .select({
      userId: networkMembers.userId,
      networkId: networkMembers.networkId,
      role: networkMembers.role,
      networkName: networks.name,
    })
    .from(networkMembers)
    .innerJoin(networks, eq(networkMembers.networkId, networks.id))
    .where(eq(networkMembers.status, "active"));

  const networksByUser = new Map<string, PlatformUserRow["networks"]>();
  for (const row of membershipRows) {
    const list = networksByUser.get(row.userId) ?? [];
    list.push({
      networkId: row.networkId,
      name: row.networkName,
      role: row.role,
    });
    networksByUser.set(row.userId, list);
  }

  return userRows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    status: row.status,
    networks: networksByUser.get(row.id) ?? [],
    moderationReason: row.moderationReason,
    moderationExpiresAt: row.moderationExpiresAt,
  }));
}

async function applyModeration(
  userId: string,
  status: "paused" | "banned",
  reason: string,
  durationDays: number | undefined,
  actorUserId: string,
  auditAction: string,
): Promise<{ ok: boolean; message: string }> {
  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === "deleted") {
    return { ok: false, message: "User not found." };
  }
  if (userId === actorUserId) {
    return { ok: false, message: "You cannot moderate your own account." };
  }

  const expiresAt = moderationExpiresFromDays(durationDays);
  const now = new Date().toISOString();

  if (status === "paused") {
    const { pauseUserProposalSideEffects } = await import("@/actions/users");
    await pauseUserProposalSideEffects(db, userId, actorUserId);
  }

  if (status === "banned") {
    await removeAllMemberships(userId);
  }

  await db
    .update(users)
    .set({
      status,
      moderationReason: reason,
      moderationExpiresAt: expiresAt,
      sessionVersion: user.sessionVersion + 1,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(actorUserId, auditAction, JSON.stringify({ userId, reason, expiresAt }));
  revalidatePath("/platform-admin");
  revalidatePath("/admin");
  revalidatePath("/people-places");

  const label = status === "paused" ? "Paused" : "Banned";
  return { ok: true, message: `${label} ${user.displayName}.` };
}

export async function pauseUserPlatformAction(
  input: z.infer<typeof moderationInputSchema>,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  const parsed = moderationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return applyModeration(
    parsed.data.userId,
    "paused",
    parsed.data.reason,
    parsed.data.durationDays,
    admin.user.id,
    "platform.pause_user",
  );
}

export async function banUserPlatformAction(
  input: z.infer<typeof moderationInputSchema>,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  const parsed = moderationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return applyModeration(
    parsed.data.userId,
    "banned",
    parsed.data.reason,
    parsed.data.durationDays,
    admin.user.id,
    "platform.ban_user",
  );
}

export async function resumeUserPlatformAction(
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };

  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || (user.status !== "paused" && user.status !== "banned")) {
    return { ok: false, message: "User is not paused or banned." };
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      status: "active",
      moderationReason: null,
      moderationExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(admin.user.id, "platform.resume_user", JSON.stringify({ userId }));
  revalidatePath("/platform-admin");
  revalidatePath("/admin");
  return { ok: true, message: `Resumed ${user.displayName}.` };
}

export async function deleteUserPlatformAction(
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  if (userId === admin.user.id) {
    return { ok: false, message: "You cannot delete your own account." };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === "deleted") {
    return { ok: false, message: "User not found." };
  }

  await removeAllMemberships(userId);
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      status: "deleted",
      sessionVersion: user.sessionVersion + 1,
      moderationReason: null,
      moderationExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(admin.user.id, "platform.delete_user", JSON.stringify({ userId }));
  revalidatePath("/platform-admin");
  return { ok: true, message: `Deleted ${user.displayName}.` };
}

export { getModerationDisplayForUser, clearExpiredModeration } from "@/lib/users/moderation-db";
