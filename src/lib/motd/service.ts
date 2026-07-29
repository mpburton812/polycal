import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

import type { getDb } from "@/lib/db/client";
import { motdAcknowledgments, motdMessages } from "@/lib/db/schema";
import type { MotdAdminState, MotdPublic, MotdScope } from "@/lib/motd/types";

type Db = ReturnType<typeof getDb>;

function toPublic(row: {
  id: string;
  scope: string;
  networkId: string | null;
  body: string;
  createdAt: string;
  endsAt: string | null;
}): MotdPublic {
  return {
    id: row.id,
    scope: row.scope as MotdScope,
    networkId: row.networkId,
    body: row.body,
    createdAt: row.createdAt,
    endsAt: row.endsAt,
  };
}

function toAdmin(row: typeof motdMessages.$inferSelect): MotdAdminState {
  return {
    ...toPublic(row),
    status: row.status as MotdAdminState["status"],
    createdByUserId: row.createdByUserId,
  };
}

/**
 * Marks active MOTDs past endsAt as expired (lazy cleanup on read / cron).
 */
export async function expireStaleMotds(
  db: Db,
  nowIso: string = new Date().toISOString(),
): Promise<number> {
  const result = await db
    .update(motdMessages)
    .set({ status: "expired" })
    .where(
      and(
        eq(motdMessages.status, "active"),
        sql`${motdMessages.endsAt} IS NOT NULL`,
        lt(motdMessages.endsAt, nowIso),
      ),
    );
  return Number(result.rowsAffected ?? 0);
}

/**
 * Clears every active MOTD for a scope (before publishing a replacement).
 */
export async function clearActiveMotdsForScope(
  db: Db,
  scope: MotdScope,
  networkId: string | null,
): Promise<void> {
  if (scope === "platform") {
    await db
      .update(motdMessages)
      .set({ status: "cleared" })
      .where(
        and(
          eq(motdMessages.scope, "platform"),
          eq(motdMessages.status, "active"),
          isNull(motdMessages.networkId),
        ),
      );
    return;
  }
  if (!networkId) {
    throw new Error("networkId required for network MOTD clear");
  }
  await db
    .update(motdMessages)
    .set({ status: "cleared" })
    .where(
      and(
        eq(motdMessages.scope, "network"),
        eq(motdMessages.status, "active"),
        eq(motdMessages.networkId, networkId),
      ),
    );
}

/**
 * Inserts a new active MOTD after clearing any previous active for the scope.
 */
export async function publishMotd(
  db: Db,
  input: {
    scope: MotdScope;
    networkId: string | null;
    body: string;
    endsAt: string | null;
    createdByUserId: string;
  },
): Promise<MotdAdminState> {
  await expireStaleMotds(db);
  await clearActiveMotdsForScope(db, input.scope, input.networkId);
  const now = new Date().toISOString();
  const id = `motd-${randomUUID()}`;
  await db.insert(motdMessages).values({
    id,
    scope: input.scope,
    networkId: input.networkId,
    body: input.body,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    endsAt: input.endsAt,
    status: "active",
  });
  const [row] = await db
    .select()
    .from(motdMessages)
    .where(eq(motdMessages.id, id))
    .limit(1);
  return toAdmin(row!);
}

/**
 * Returns the single active MOTD for a scope, or null.
 */
export async function getActiveMotdForScope(
  db: Db,
  scope: MotdScope,
  networkId: string | null,
): Promise<MotdAdminState | null> {
  await expireStaleMotds(db);
  if (scope === "platform") {
    const [row] = await db
      .select()
      .from(motdMessages)
      .where(
        and(
          eq(motdMessages.scope, "platform"),
          eq(motdMessages.status, "active"),
          isNull(motdMessages.networkId),
        ),
      )
      .limit(1);
    return row ? toAdmin(row) : null;
  }
  if (!networkId) return null;
  const [row] = await db
    .select()
    .from(motdMessages)
    .where(
      and(
        eq(motdMessages.scope, "network"),
        eq(motdMessages.status, "active"),
        eq(motdMessages.networkId, networkId),
      ),
    )
    .limit(1);
  return row ? toAdmin(row) : null;
}

async function isAcknowledged(
  db: Db,
  motdId: string,
  userId: string,
): Promise<boolean> {
  const [acked] = await db
    .select()
    .from(motdAcknowledgments)
    .where(
      and(
        eq(motdAcknowledgments.motdId, motdId),
        eq(motdAcknowledgments.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(acked);
}

/**
 * Active MOTDs the viewer has not acknowledged, platform first then network.
 */
export async function listUnackedMotdsForViewer(
  db: Db,
  userId: string,
  activeNetworkId: string | null,
): Promise<MotdPublic[]> {
  await expireStaleMotds(db);
  const cleaned: MotdPublic[] = [];

  const platform = await getActiveMotdForScope(db, "platform", null);
  if (platform && !(await isAcknowledged(db, platform.id, userId))) {
    cleaned.push(toPublic(platform));
  }

  if (activeNetworkId) {
    const network = await getActiveMotdForScope(db, "network", activeNetworkId);
    if (network && !(await isAcknowledged(db, network.id, userId))) {
      cleaned.push(toPublic(network));
    }
  }

  return cleaned;
}

/**
 * Records dismiss-once acknowledgment. Idempotent.
 */
export async function acknowledgeMotd(
  db: Db,
  motdId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(motdAcknowledgments)
    .values({
      motdId,
      userId,
      acknowledgedAt: now,
    })
    .onConflictDoNothing();
}
