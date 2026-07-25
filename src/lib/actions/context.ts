import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import type { UserRole } from "@/types/user";

export interface SessionUser {
  id: string;
  role: UserRole;
  /** True when an admin is impersonating this account (PC-344). */
  isImpersonating: boolean;
}

export type ActionContextError = { ok: false; message: string };

/** Shown to paused accounts so they know the block is administrative, not a bug. */
export const PAUSED_ACCOUNT_MESSAGE =
  "Your account is paused. Contact an administrator to regain access.";

/**
 * Requires a signed-in, non-paused session or returns a standard error shape (PC-80).
 *
 * Pausing bumps `sessionVersion`, which normally invalidates the JWT on its next
 * refresh — but that leaves a window (and depends on the refresh path running),
 * so paused accounts are rejected here as well (PC-353). Sign-out is unaffected:
 * it goes through the Auth.js route handler, not this helper.
 */
export async function requireSession():
  Promise<{ ok: true; user: SessionUser } | ActionContextError> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in required." };
  }
  if (session.user.accountStatus === "paused") {
    return { ok: false, message: PAUSED_ACCOUNT_MESSAGE };
  }
  return {
    ok: true,
    user: {
      id: session.user.id,
      role: session.user.role as UserRole,
      isImpersonating: session.user.isImpersonating === true,
    },
  };
}

/**
 * Requires admin panel access (role-based; PC-80 / PC-280).
 */
export async function requireAdminAccess():
  Promise<{ ok: true; user: SessionUser } | ActionContextError> {
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return sessionResult;
  }
  const isAdmin = await userHasAdminAccess(sessionResult.user.role);
  if (!isAdmin) {
    return { ok: false, message: "Admin access required." };
  }
  return sessionResult;
}

/**
 * Runs a callback with an ensured DB handle after optional session check (PC-80).
 */
export async function withDb<T>(
  fn: (db: ReturnType<typeof getDb>) => Promise<T>,
): Promise<T> {
  await ensureDbReady();
  return fn(getDb());
}
