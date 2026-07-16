import type { UserRole } from "@/types/user";

/**
 * Human-readable role labels. DB still stores `passive`; UI shows Proxy (PC-256).
 */
export function formatUserRole(role: UserRole | string): string {
  if (role === "passive") return "Proxy";
  if (role === "admin") return "Admin";
  if (role === "user") return "User";
  return role;
}
