import type { UserRole } from "@/types/user";

/** Multi-network tenancy types (PC-357). */

export const networkStatuses = ["active", "paused", "pending_delete"] as const;
export type NetworkStatus = (typeof networkStatuses)[number];

/** Role within a single network (platform identity is separate). */
export const networkMemberRoles = ["sponsor", "network_admin", "user", "passive"] as const;
export type NetworkMemberRole = (typeof networkMemberRoles)[number];

export const networkMemberStatuses = ["active", "removed"] as const;
export type NetworkMemberStatus = (typeof networkMemberStatuses)[number];

export interface PlatformSettings {
  maxNetworksPerEmail: number;
  maxNetworkCreatesPerDay: number;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  maxNetworksPerEmail: 3,
  maxNetworkCreatesPerDay: 10,
};

export function legacyRoleToNetworkRole(
  role: "admin" | "user" | "passive",
): NetworkMemberRole {
  if (role === "admin") return "network_admin";
  if (role === "passive") return "passive";
  return "user";
}

/** Maps network membership role → legacy users.role for transitional gates. */
export function networkRoleToLegacyRole(
  role: NetworkMemberRole,
): "admin" | "user" | "passive" {
  if (role === "sponsor" || role === "network_admin") return "admin";
  if (role === "passive") return "passive";
  return "user";
}

const MEMBERSHIP_ROLE_RANK: Record<NetworkMemberRole, number> = {
  sponsor: 0,
  network_admin: 1,
  user: 2,
  passive: 3,
};

/**
 * Highest active membership. Sponsor outranks network admin, which outranks
 * user, which outranks proxy (DB role `passive`) (PC-536).
 */
export function primaryMembershipRole(
  roles: readonly NetworkMemberRole[],
): NetworkMemberRole | null {
  if (roles.length === 0) return null;
  return [...roles].sort((a, b) => MEMBERSHIP_ROLE_RANK[a] - MEMBERSHIP_ROLE_RANK[b])[0] ?? null;
}

/** One map from membership role to the legacy session role string (PC-536). */
export function primaryLegacyRole(roles: readonly NetworkMemberRole[]): UserRole {
  const primary = primaryMembershipRole(roles);
  if (!primary) return "user";
  return networkRoleToLegacyRole(primary);
}
