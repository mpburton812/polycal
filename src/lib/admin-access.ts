import type { UserRole } from "@/types/user";

/**
 * Whether the user may access Admin tab features. Power management ("all users as
 * administrators") was removed (PC-280) — access is strictly role-based. Impersonation
 * (admin-as-user) is unaffected and still lets admins act as another account.
 */
export async function userHasAdminAccess(role: UserRole): Promise<boolean> {
  return role === "admin";
}
