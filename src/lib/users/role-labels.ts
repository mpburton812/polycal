import type { UserRole } from "@/types/user";

/** Account access levels shown in Admin / Platform Admin consoles (PC-368). */
export type AccountAccessLevel = "platform_admin" | "admin" | "user" | "passive";

/**
 * Human-readable role labels. DB still stores `passive`; UI shows Proxy (PC-256).
 */
export function formatUserRole(role: UserRole | string): string {
  if (role === "passive") return "Proxy";
  if (role === "admin") return "Admin";
  if (role === "user") return "User";
  return role;
}

/**
 * Resolves the operator-facing access level: platform admin outranks network/legacy role.
 */
export function resolveAccessLevel(input: {
  role: UserRole | string;
  isPlatformAdmin: boolean;
}): AccountAccessLevel {
  if (input.isPlatformAdmin) return "platform_admin";
  if (input.role === "admin") return "admin";
  if (input.role === "passive") return "passive";
  return "user";
}

/**
 * Label for access level chips and Platform Admin All Users (PC-369 / PC-370).
 */
export function formatAccessLevel(
  input: AccountAccessLevel | { role: UserRole | string; isPlatformAdmin: boolean },
): string {
  const level = typeof input === "string" ? input : resolveAccessLevel(input);
  if (level === "platform_admin") return "Platform Admin";
  if (level === "admin") return "Admin";
  if (level === "passive") return "Proxy";
  return "User";
}
