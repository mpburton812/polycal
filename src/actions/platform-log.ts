"use server";

import { desc, eq, or } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { platformLogAcknowledgments, platformSystemLog } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/networks/context";

export type PlatformSystemLogEntry = {
  id: string;
  createdAt: string;
  networkName: string | null;
  actorDisplayName: string | null;
  action: string;
  summary: string;
  severity: "major" | "info";
  emphasized: boolean;
};

export type PlatformLogAlert = {
  id: string;
  summary: string;
  emphasized: boolean;
};

/**
 * Newest platform system log rows for the Admin / Platform Admin consoles (PC-463).
 */
export async function listPlatformSystemLogAction(
  limit = 100,
): Promise<PlatformSystemLogEntry[]> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return [];
  await ensureDbReady();
  const db = getDb();
  const rows = await db
    .select({
      id: platformSystemLog.id,
      createdAt: platformSystemLog.createdAt,
      networkName: platformSystemLog.networkName,
      actorDisplayName: platformSystemLog.actorDisplayName,
      action: platformSystemLog.action,
      summary: platformSystemLog.summary,
      severity: platformSystemLog.severity,
      emphasized: platformSystemLog.emphasized,
    })
    .from(platformSystemLog)
    .orderBy(desc(platformSystemLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));

  return rows.map((row) => ({
    ...row,
    severity: row.severity === "major" ? "major" : "info",
    emphasized: row.emphasized === true,
  }));
}

/**
 * Unacked major (and emphasized) alerts for the signed-in platform operator (PC-463).
 */
export async function listUnackedPlatformLogAlertsAction(): Promise<PlatformLogAlert[]> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return [];
  await ensureDbReady();
  const db = getDb();
  const acked = await db
    .select({ logId: platformLogAcknowledgments.logId })
    .from(platformLogAcknowledgments)
    .where(eq(platformLogAcknowledgments.userId, admin.user.id));
  const ackedIds = new Set(acked.map((row) => row.logId));

  const rows = await db
    .select({
      id: platformSystemLog.id,
      summary: platformSystemLog.summary,
      emphasized: platformSystemLog.emphasized,
      severity: platformSystemLog.severity,
    })
    .from(platformSystemLog)
    .where(
      or(eq(platformSystemLog.severity, "major"), eq(platformSystemLog.emphasized, true)),
    )
    .orderBy(desc(platformSystemLog.createdAt))
    .limit(50);

  return rows
    .filter((row) => !ackedIds.has(row.id))
    .map((row) => ({
      id: row.id,
      summary: row.summary,
      emphasized: row.emphasized === true,
    }));
}

/**
 * Dismiss-once acknowledgment for a platform log alert (PC-463).
 */
export async function acknowledgePlatformLogAction(
  logId: string,
): Promise<{ ok: boolean; message: string }> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  if (typeof logId !== "string" || !logId.trim()) {
    return { ok: false, message: "Invalid log id." };
  }
  await ensureDbReady();
  const db = getDb();
  await db
    .insert(platformLogAcknowledgments)
    .values({
      logId: logId.trim(),
      userId: admin.user.id,
      acknowledgedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
  return { ok: true, message: "Acknowledged." };
}
