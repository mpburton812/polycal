import type { NetworkMemberRole } from "@/types/network";
import type { UserRole } from "@/types/user";
import { isElevatedNetworkRole } from "@/lib/networks/roles";

/**
 * Whether the user may access Admin tab features. Power management ("all users as
 * administrators") was removed (PC-280) — access is strictly role-based. Impersonation
 * (admin-as-user) is unaffected and still lets admins act as another account.
 */
export interface AdminAccessSession {
  role: UserRole;
  activeNetworkRole?: NetworkMemberRole;
  isPlatformAdmin?: boolean;
}

/**
 * Network- and platform-aware admin check (schema refactor phase 2).
 * Prefer this over role-only checks for authorization gates.
 */
export function resolveAdminAccess(user: AdminAccessSession): boolean {
  if (user.isPlatformAdmin === true) return true;
  if (isElevatedNetworkRole(user.activeNetworkRole)) return true;
  return false;
}

/** Builds an {@link AdminAccessSession} from a JWT session user payload. */
export function adminAccessFromSessionUser(user: {
  role: UserRole;
  activeNetworkRole?: NetworkMemberRole;
  isPlatformAdmin?: boolean;
}): AdminAccessSession {
  return {
    role: user.role,
    activeNetworkRole: user.activeNetworkRole,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}

/**
 * Builds admin access from a DB user row. Denormalized `users.role === "admin"`
 * maps to network_admin (synced on membership upsert) — PC-396.
 */
export function adminAccessFromUserRow(row: {
  role: UserRole | string;
  isPlatformAdmin?: boolean | null;
}): AdminAccessSession {
  const role = row.role as UserRole;
  return {
    role,
    isPlatformAdmin: row.isPlatformAdmin === true,
    activeNetworkRole: role === "admin" ? "network_admin" : undefined,
  };
}

/**
 * Whether the user may access admin-only features.
 *
 * - Pass an {@link AdminAccessSession} (or auth user) for network-aware checks.
 * - Pass a bare {@link UserRole} only when evaluating a stored user row in isolation
 *   (e.g. passive proxy detection) — not for session authorization.
 */
export async function userHasAdminAccess(
  input: UserRole | AdminAccessSession,
): Promise<boolean> {
  if (typeof input === "object") {
    return resolveAdminAccess(input);
  }
  // Denormalized legacy role string — prefer AdminAccessSession at call sites (PC-396).
  return input === "admin";
}

/**
 * Whether the signed-in user should see the Admin tab — network admins or
 * platform operators (PC-363 / PC-362).
 */
export function userCanSeeAdminTab(user: AdminAccessSession): boolean {
  return resolveAdminAccess(user);
}

/** Async alias for server actions that already await admin checks. */
export async function userCanAccessAdminPanel(
  session: AdminAccessSession,
): Promise<boolean> {
  return userCanSeeAdminTab(session);
}
