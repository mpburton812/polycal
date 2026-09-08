import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { networks, platformSystemLog, users } from "@/lib/db/schema";

export type PlatformLogSeverity = "major" | "info";

export type PlatformLogInput = {
  action: string;
  summary: string;
  actorUserId?: string | null;
  networkId?: string | null;
  networkName?: string | null;
  severity?: PlatformLogSeverity;
  emphasized?: boolean;
  /** Optional subject of the event (e.g. removed member) — PC-497. */
  targetUserId?: string | null;
  targetDisplayName?: string | null;
};

/**
 * Appends a platform system log row. networkName is snapshotted so the row
 * survives a later network hard-wipe (PC-463). Target fields support alert
 * detail without relying on anonymous summaries (PC-497).
 */
export async function logPlatformEvent(input: PlatformLogInput): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  let actorDisplayName: string | null = null;
  if (input.actorUserId) {
    const [actor] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, input.actorUserId))
      .limit(1);
    actorDisplayName = actor?.displayName ?? null;
  }

  let networkName = input.networkName ?? null;
  if (!networkName && input.networkId) {
    const [network] = await db
      .select({ name: networks.name })
      .from(networks)
      .where(eq(networks.id, input.networkId))
      .limit(1);
    networkName = network?.name ?? null;
  }

  let targetDisplayName = input.targetDisplayName?.trim() || null;
  if (!targetDisplayName && input.targetUserId) {
    const [target] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, input.targetUserId))
      .limit(1);
    targetDisplayName = target?.displayName ?? null;
  }

  const id = randomUUID();
  await db.insert(platformSystemLog).values({
    id,
    createdAt: now,
    networkName,
    networkId: input.networkId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorDisplayName,
    targetUserId: input.targetUserId ?? null,
    targetDisplayName,
    severity: input.severity ?? "info",
    action: input.action,
    summary: input.summary,
    emphasized: input.emphasized === true,
  });
  return id;
}
