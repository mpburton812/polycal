"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logUserActivity } from "@/lib/audit";
import {
  formatActivityLogDetails,
  getNotificationActivityActor,
} from "@/lib/audit/activity-log-display";
import { requireAdminAccess, withDb } from "@/lib/actions/context";
import {
  getImpersonationSecret,
  isImpersonationAllowedForEnvironment,
} from "@/lib/auth/impersonation";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { getAppEnvironment, isNonProductionEnvironment } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { polyGroup, userActivityLog, users } from "@/lib/db/schema";

import { resetTestDatabase } from "@/lib/seed/reset-test-database";

export interface AdminActionResult {
  ok: boolean;
  message: string;
}

export interface ResetTestDatabaseResult {
  ok: boolean;
  message: string;
  userCount?: number;
  proposalCount?: number;
}

/**
 * Admin-only wipe + reseed for feature/dev/test databases (spec §1.5).
 */
export async function resetTestDatabaseAction(): Promise<ResetTestDatabaseResult> {
  if (!isNonProductionEnvironment()) {
    return { ok: false, message: "Reset is disabled in production." };
  }

  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  await ensureDbReady();
  const result = await resetTestDatabase();
  await logUserActivity(adminResult.user.id, "admin.reset_test_database", "Full reseed");

  revalidatePath("/admin");
  revalidatePath("/proposals");
  revalidatePath("/schedule");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: `Test database reset complete (${result.userCount} users, ${result.proposalCount} proposals).`,
    userCount: result.userCount,
    proposalCount: result.proposalCount,
  };
}

/**
 * Records an admin-initiated force reload before the client clears PWA caches.
 */
export async function logForceReloadAction(): Promise<AdminActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  await ensureDbReady();
  await logUserActivity(
    adminResult.user.id,
    "admin.force_reload",
    JSON.stringify({
      environment: getAppEnvironment(),
    }),
  );

  return { ok: true, message: "Reloading to the latest version…" };
}

/**
 * Admin impersonation — signs in as another active user (audit logged).
 */
export async function adminImpersonateUserAction(userId: string): Promise<AdminActionResult> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  if (userId === adminResult.user.id) {
    return { ok: false, message: "You are already signed in as this user." };
  }

  if (!isImpersonationAllowedForEnvironment()) {
    return { ok: false, message: "Impersonation is disabled on this environment." };
  }

  const secret = getImpersonationSecret();
  if (!secret) {
    return { ok: false, message: "Impersonation is not configured on this server." };
  }

  const target = await withDb(async (db) => {
    const [row] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row;
  });

  await logUserActivity(
    adminResult.user.id,
    "admin.impersonate",
    JSON.stringify({
      targetUserId: userId,
      targetDisplayName: target?.displayName ?? null,
    }),
    "system",
  );

  const { signIn } = await import("@/lib/auth");
  await signIn("credentials", {
    impersonateUserId: userId,
    impersonateSecret: secret,
    redirectTo: "/feed",
  });

  return { ok: true, message: "Switching user…" };
}

export interface ActivityLogEntry {
  id: number;
  userId: string | null;
  userDisplayName: string | null;
  action: string;
  details: string | null;
  eventType: string;
  createdAt: string;
}

/**
 * Adds the original notification recipient to details after the log's User column
 * is reassigned to the initiating actor (PC-299).
 */
function withNotificationRecipient(
  action: string,
  details: string | null,
  recipientDisplayName: string | null,
): string | null {
  if (!action.startsWith("notification.") || !details || !recipientDisplayName) return details;
  try {
    return JSON.stringify({
      ...(JSON.parse(details) as Record<string, unknown>),
      recipientDisplayName,
    });
  } catch {
    return details;
  }
}

/**
 * Lists recent system administrator log entries (PC-32).
 */
export async function listActivityLogAction(): Promise<ActivityLogEntry[]> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return [];
  }

  await ensureDbReady();
  const db = getDb();
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  const tail = group?.logTailLength ?? 100;
  if (tail === 0) return [];

  const rows = await db
    .select({
      id: userActivityLog.id,
      userId: userActivityLog.userId,
      action: userActivityLog.action,
      details: userActivityLog.details,
      eventType: userActivityLog.eventType,
      createdAt: userActivityLog.createdAt,
    })
    .from(userActivityLog)
    .orderBy(desc(userActivityLog.id))
    .limit(tail);

  const notificationActors = rows.map((row) =>
    getNotificationActivityActor(row.action, row.details),
  );
  const userIds = [
    ...new Set(
      [
        ...rows.map((row) => row.userId),
        ...notificationActors.map((actor) => actor?.actorUserId),
      ].filter(Boolean),
    ),
  ] as string[];
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users);
    for (const u of userRows) {
      userMap.set(u.id, u.displayName);
    }
  }

  return rows.map((row, index) => {
    const recipientDisplayName = row.userId ? (userMap.get(row.userId) ?? null) : null;
    const actor = notificationActors[index];
    return {
      ...row,
      userId: actor?.actorUserId ?? row.userId,
      userDisplayName:
        actor?.actorDisplayName ??
        (actor?.actorUserId ? (userMap.get(actor.actorUserId) ?? null) : recipientDisplayName),
      details: actor
        ? withNotificationRecipient(row.action, row.details, recipientDisplayName)
        : row.details,
    };
  });
}

/**
 * Exports the activity log as CSV text (PC-32).
 */
export async function exportActivityLogAction(): Promise<{ ok: boolean; csv?: string; message: string }> {
  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    return { ok: false, message: adminResult.message };
  }

  const entries = await listActivityLogAction();
  const header = "timestamp,event_type,user,action,details";
  const lines = entries.map((e) => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      esc(e.createdAt),
      esc(e.eventType),
      esc(e.userDisplayName ?? ""),
      esc(e.action),
      esc(formatActivityLogDetails(e.action, e.details ?? null)),
    ].join(",");
  });

  await logUserActivity(adminResult.user.id, "admin.export_activity_log", undefined, "system");
  return { ok: true, csv: [header, ...lines].join("\n"), message: "Export ready." };
}
