"use server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { logUserActivity } from "@/lib/audit";
import { logPlatformEvent } from "@/lib/platform-log";
import {
  acknowledgeMotd,
  clearActiveMotdsForScope,
  expireStaleMotds,
  getActiveMotdForScope,
  getMotdById,
  listUnackedMotdsForViewer,
  publishMotd,
} from "@/lib/motd/service";
import {
  normalizeMotdBody,
  parseOptionalEndsAt,
  type MotdAdminState,
  type MotdPublic,
} from "@/lib/motd/types";
import {
  requireNetworkAdmin,
  requireNetworkSession,
  requirePlatformAdmin,
} from "@/lib/networks/context";
import { revalidateNotificationShellPaths } from "@/lib/notifications-revalidate";

export type MotdActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

/**
 * Active unacked MOTDs for the signed-in viewer (platform then network).
 */
export async function getActiveMotdsForViewerAction(): Promise<
  MotdActionResult<MotdPublic[]>
> {
  const session = await requireNetworkSession();
  if (!session.ok) {
    // Platform admins without a network still need MOTDs.
    const platformOnly = await requirePlatformAdmin();
    if (!platformOnly.ok) return { ok: false, message: session.message };
    await ensureDbReady();
    const db = getDb();
    const items = await listUnackedMotdsForViewer(db, platformOnly.user.id, null);
    return { ok: true, data: items };
  }
  await ensureDbReady();
  const db = getDb();
  const items = await listUnackedMotdsForViewer(
    db,
    session.user.id,
    session.user.activeNetworkId || null,
  );
  return { ok: true, data: items };
}

/**
 * Dismiss-once acknowledgment for an MOTD.
 * On first dismiss, archives a copy into the in-app notification inbox (PC-392).
 */
export async function acknowledgeMotdAction(
  motdId: string,
): Promise<MotdActionResult<{ id: string }>> {
  if (typeof motdId !== "string" || !motdId.trim()) {
    return { ok: false, message: "Invalid message id." };
  }
  let userId: string | null = null;
  const session = await requireNetworkSession();
  if (session.ok) {
    userId = session.user.id;
  } else {
    const platformOnly = await requirePlatformAdmin();
    if (!platformOnly.ok) return { ok: false, message: session.message };
    userId = platformOnly.user.id;
  }
  await ensureDbReady();
  const db = getDb();
  const id = motdId.trim();
  const newlyAcked = await acknowledgeMotd(db, id, userId);
  if (newlyAcked) {
    const motd = await getMotdById(db, id);
    if (motd) {
      const scopeLabel =
        motd.scope === "platform" ? "Platform message" : "Network message";
      // In-app archive only — user already saw the pop-up; avoid push/email re-alert.
      await logUserActivity(
        userId,
        "notification.motd",
        JSON.stringify({
          message: `${scopeLabel}: ${motd.body}`,
          url: "/feed",
          motdId: motd.id,
          scope: motd.scope,
          networkId: motd.networkId,
        }),
        "system",
      );
      revalidateNotificationShellPaths();
    }
  }
  return { ok: true, data: { id } };
}

/**
 * Current active network MOTD for admin form.
 */
export async function getNetworkMotdAdminStateAction(): Promise<
  MotdActionResult<MotdAdminState | null>
> {
  const admin = await requireNetworkAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  await ensureDbReady();
  const db = getDb();
  const row = await getActiveMotdForScope(
    db,
    "network",
    admin.user.activeNetworkId,
  );
  return { ok: true, data: row };
}

/**
 * Current active platform MOTD for platform admin form.
 */
export async function getPlatformMotdAdminStateAction(): Promise<
  MotdActionResult<MotdAdminState | null>
> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  await ensureDbReady();
  const db = getDb();
  const row = await getActiveMotdForScope(db, "platform", null);
  return { ok: true, data: row };
}

/**
 * Publish (replace) the active network MOTD.
 */
export async function publishNetworkMotdAction(input: {
  body: string;
  endsAt?: string | null;
}): Promise<MotdActionResult<MotdAdminState>> {
  const admin = await requireNetworkAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  const bodyResult = normalizeMotdBody(input.body);
  if (!bodyResult.ok) return bodyResult;
  const ends = parseOptionalEndsAt(input.endsAt ?? null);
  if (!ends.ok) return ends;

  await ensureDbReady();
  const db = getDb();
  const row = await publishMotd(db, {
    scope: "network",
    networkId: admin.user.activeNetworkId,
    body: bodyResult.body,
    endsAt: ends.endsAt,
    createdByUserId: admin.user.id,
  });
  await logUserActivity(
    admin.user.id,
    "motd.network.publish",
    JSON.stringify({ motdId: row.id, endsAt: row.endsAt }),
  );
  await logPlatformEvent({
    actorUserId: admin.user.id,
    networkId: admin.user.activeNetworkId,
    action: "motd.network.publish",
    summary: `Admin set a network MOTD on ${admin.user.networkName}`,
    severity: "major",
  });
  return { ok: true, data: row };
}

/**
 * Clear the active network MOTD.
 */
export async function clearNetworkMotdAction(): Promise<
  MotdActionResult<{ cleared: boolean }>
> {
  const admin = await requireNetworkAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  await ensureDbReady();
  const db = getDb();
  await expireStaleMotds(db);
  await clearActiveMotdsForScope(db, "network", admin.user.activeNetworkId);
  await logUserActivity(admin.user.id, "motd.network.clear");
  return { ok: true, data: { cleared: true } };
}

/**
 * Publish (replace) the active platform MOTD.
 */
export async function publishPlatformMotdAction(input: {
  body: string;
  endsAt?: string | null;
}): Promise<MotdActionResult<MotdAdminState>> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  const bodyResult = normalizeMotdBody(input.body);
  if (!bodyResult.ok) return bodyResult;
  const ends = parseOptionalEndsAt(input.endsAt ?? null);
  if (!ends.ok) return ends;

  await ensureDbReady();
  const db = getDb();
  const row = await publishMotd(db, {
    scope: "platform",
    networkId: null,
    body: bodyResult.body,
    endsAt: ends.endsAt,
    createdByUserId: admin.user.id,
  });
  await logUserActivity(
    admin.user.id,
    "motd.platform.publish",
    JSON.stringify({ motdId: row.id, endsAt: row.endsAt }),
  );
  await logPlatformEvent({
    actorUserId: admin.user.id,
    action: "motd.platform.publish",
    summary: "Admin set a platform MOTD",
    severity: "major",
  });
  return { ok: true, data: row };
}

/**
 * Clear the active platform MOTD.
 */
export async function clearPlatformMotdAction(): Promise<
  MotdActionResult<{ cleared: boolean }>
> {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return { ok: false, message: admin.message };
  await ensureDbReady();
  const db = getDb();
  await expireStaleMotds(db);
  await clearActiveMotdsForScope(db, "platform", null);
  await logUserActivity(admin.user.id, "motd.platform.clear");
  return { ok: true, data: { cleared: true } };
}
