import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

import { getDb } from "@/lib/db/client";
import { networkMembers, networks, users } from "@/lib/db/schema";
import type { NetworkMemberRole, NetworkStatus } from "@/types/network";
import { primaryLegacyRole } from "@/types/network";
import type { UserRole } from "@/types/user";
import { isSponsorRole } from "@/lib/networks/roles";

export type MembershipRow = {
  id: string;
  networkId: string;
  userId: string;
  role: NetworkMemberRole;
  status: "active" | "removed";
  networkName: string;
  networkStatus: NetworkStatus;
};

/**
 * Lists active network memberships for a platform user (PC-357).
 */
export async function listActiveMemberships(
  userId: string,
): Promise<MembershipRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: networkMembers.id,
      networkId: networkMembers.networkId,
      userId: networkMembers.userId,
      role: networkMembers.role,
      status: networkMembers.status,
      networkName: networks.name,
      networkStatus: networks.status,
    })
    .from(networkMembers)
    .innerJoin(networks, eq(networkMembers.networkId, networks.id))
    .where(
      and(eq(networkMembers.userId, userId), eq(networkMembers.status, "active")),
    );

  return rows.map((r) => ({
    ...r,
    role: r.role as NetworkMemberRole,
    status: r.status as "active" | "removed",
    networkStatus: r.networkStatus as NetworkStatus,
  }));
}

/**
 * Resolves membership for a user in a network, or null when absent/removed.
 */
export async function getMembership(
  userId: string,
  networkId: string,
): Promise<MembershipRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: networkMembers.id,
      networkId: networkMembers.networkId,
      userId: networkMembers.userId,
      role: networkMembers.role,
      status: networkMembers.status,
      networkName: networks.name,
      networkStatus: networks.status,
    })
    .from(networkMembers)
    .innerJoin(networks, eq(networkMembers.networkId, networks.id))
    .where(
      and(
        eq(networkMembers.userId, userId),
        eq(networkMembers.networkId, networkId),
        eq(networkMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    role: row.role as NetworkMemberRole,
    status: row.status as "active" | "removed",
    networkStatus: row.networkStatus as NetworkStatus,
  };
}

/**
 * Writes users.role from memberships. Queries must not read the column (PC-536).
 */
export async function syncDenormalizedUserRole(userId: string): Promise<void> {
  const memberships = await listActiveMemberships(userId);
  const legacy = primaryLegacyRole(memberships.map((membership) => membership.role));
  if (memberships.length === 0) return;

  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      role: legacy,
      updatedAt: now,
    })
    .where(eq(users.id, userId));
}

/** Legacy session role derived only from active memberships (PC-536). */
export async function legacyRoleForUser(userId: string): Promise<UserRole> {
  const memberships = await listActiveMemberships(userId);
  return primaryLegacyRole(memberships.map((membership) => membership.role));
}

/** Batch form of {@link legacyRoleForUser}. Users with no membership map to `user`. */
export async function legacyRolesForUsers(userIds: readonly string[]): Promise<Map<string, UserRole>> {
  const unique = [...new Set(userIds)];
  const map = new Map<string, UserRole>();
  if (unique.length === 0) return map;
  const db = getDb();
  const rows = await db
    .select({ userId: networkMembers.userId, role: networkMembers.role })
    .from(networkMembers)
    .where(and(inArray(networkMembers.userId, unique), eq(networkMembers.status, "active")));
  const grouped = new Map<string, NetworkMemberRole[]>();
  for (const row of rows) {
    const list = grouped.get(row.userId) ?? [];
    list.push(row.role as NetworkMemberRole);
    grouped.set(row.userId, list);
  }
  for (const id of unique) {
    map.set(id, primaryLegacyRole(grouped.get(id) ?? []));
  }
  return map;
}

/**
 * Upserts an active membership. Used by create/join and passive follow (PC-357).
 */
export async function upsertMembership(input: {
  networkId: string;
  userId: string;
  role: NetworkMemberRole;
}): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  const [existing] = await db
    .select({ id: networkMembers.id, role: networkMembers.role })
    .from(networkMembers)
    .where(
      and(
        eq(networkMembers.networkId, input.networkId),
        eq(networkMembers.userId, input.userId),
      ),
    )
    .limit(1);

  if (existing) {
    // Sponsor membership is sticky — inhabit / access-level writes must not demote (PC-460).
    const nextRole =
      isSponsorRole(existing.role) && !isSponsorRole(input.role)
        ? existing.role
        : input.role;
    await db
      .update(networkMembers)
      .set({
        role: nextRole,
        status: "active",
        updatedAt: now,
      })
      .where(eq(networkMembers.id, existing.id));
    await syncDenormalizedUserRole(input.userId);
    return existing.id;
  }

  const id = randomUUID();
  await db.insert(networkMembers).values({
    id,
    networkId: input.networkId,
    userId: input.userId,
    role: input.role,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await syncDenormalizedUserRole(input.userId);
  return id;
}

/**
 * Soft-removes membership from one network only (scoped delete) (PC-362).
 */
export async function removeMembership(
  userId: string,
  networkId: string,
): Promise<boolean> {
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db
    .update(networkMembers)
    .set({ status: "removed", updatedAt: now })
    .where(
      and(
        eq(networkMembers.userId, userId),
        eq(networkMembers.networkId, networkId),
        eq(networkMembers.status, "active"),
      ),
    );
  return (result.rowsAffected ?? 0) > 0;
}

/**
 * Soft-removes every membership for a user (platform ban companion) (PC-362).
 */
export async function removeAllMemberships(userId: string): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  const result = await db
    .update(networkMembers)
    .set({ status: "removed", updatedAt: now })
    .where(
      and(eq(networkMembers.userId, userId), eq(networkMembers.status, "active")),
    );
  return result.rowsAffected ?? 0;
}

/**
 * Adds owned passive profiles into a destination network (PC-357 / PC-361).
 */
export async function ensureOwnedPassivesInNetwork(
  ownerUserId: string,
  networkId: string,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(networkMembers, eq(networkMembers.userId, users.id))
    .where(
      and(
        eq(users.ownedByUserId, ownerUserId),
        eq(networkMembers.role, "passive"),
        eq(networkMembers.status, "active"),
      ),
    );
  const passives = [...new Map(rows.map((row) => [row.id, row])).values()];

  for (const passive of passives) {
    await upsertMembership({
      networkId,
      userId: passive.id,
      role: "passive",
    });
  }
}
