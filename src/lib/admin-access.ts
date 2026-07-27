import type { UserRole } from "@/types/user";
import type { NetworkMemberRole } from "@/types/network";

/**
 * Whether the user may access Admin tab features. Power management ("all users as
 * administrators") was removed (PC-280) — access is strictly role-based. Impersonation
 * (admin-as-user) is unaffected and still lets admins act as another account.
 */
export async function userHasAdminAccess(role: UserRole): Promise<boolean> {
  return role === "admin";
}

export interface AdminAccessSession {
  role: UserRole;
  activeNetworkRole?: NetworkMemberRole;
  isPlatformAdmin?: boolean;
}

/**
 * Whether the signed-in user may open the network Admin tab — legacy admin role,
 * network_admin in the active network, or platform operator (PC-362).
 */
export async function userCanAccessAdminPanel(session: AdminAccessSession): Promise<boolean> {
  if (session.isPlatformAdmin) return true;
  if (session.role === "admin") return true;
  if (session.activeNetworkRole === "network_admin") return true;
  return false;
}
