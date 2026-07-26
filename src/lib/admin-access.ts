import type { NetworkMemberRole } from "@/types/network";
import type { UserRole } from "@/types/user";

/**
 * Whether the user may access Admin tab features. Power management ("all users as
 * administrators") was removed (PC-280) — access is strictly role-based. Impersonation
 * (admin-as-user) is unaffected and still lets admins act as another account.
 */
export async function userHasAdminAccess(role: UserRole): Promise<boolean> {
  return role === "admin";
}

/**
 * Whether the signed-in user should see the Admin tab — legacy admins, active
 * network admins, or platform operators (PC-363).
 */
export function userCanSeeAdminTab(user: {
  role: UserRole;
  activeNetworkRole?: NetworkMemberRole | string;
  isPlatformAdmin?: boolean;
}): boolean {
  if (user.isPlatformAdmin === true) return true;
  if (user.role === "admin") return true;
  if (user.activeNetworkRole === "network_admin") return true;
  return false;
}
