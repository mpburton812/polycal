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
};

/**
 * Appends a platform system log row. networkName is snapshotted so the row
 * survives a later network hard-wipe (PC-463).
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

  const id = randomUUID();
  await db.insert(platformSystemLog).values({
    id,
    createdAt: now,
    networkName,
    networkId: input.networkId ?? null,
    actorUserId: input.actorUserId ?? null,
    actorDisplayName,
    severity: input.severity ?? "info",
    action: input.action,
    summary: input.summary,
    emphasized: input.emphasized === true,
  });
  return id;
}
