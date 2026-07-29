"use server";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { logUserActivity } from "@/lib/audit";
import {
  acknowledgeMotd,
  clearActiveMotdsForScope,
  expireStaleMotds,
  getActiveMotdForScope,
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
  await acknowledgeMotd(db, motdId.trim(), userId);
  return { ok: true, data: { id: motdId.trim() } };
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
