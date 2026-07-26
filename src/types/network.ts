/** Multi-network tenancy types (PC-357). */

export const networkStatuses = ["active", "paused"] as const;
export type NetworkStatus = (typeof networkStatuses)[number];

/** Role within a single network (platform identity is separate). */
export const networkMemberRoles = ["network_admin", "user", "passive"] as const;
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

/** Maps legacy users.role → network membership role during backfill. */
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
  if (role === "network_admin") return "admin";
  if (role === "passive") return "passive";
  return "user";
}
