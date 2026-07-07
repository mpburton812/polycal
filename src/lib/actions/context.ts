import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";

export interface SessionUser {
  id: string;
  role: string;
}

export type ActionContextError = { ok: false; message: string };

/**
 * Requires a signed-in session or returns a standard error shape (PC-80).
 */
export async function requireSession():
  Promise<{ ok: true; user: SessionUser } | ActionContextError> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in required." };
  }
  return {
    ok: true,
    user: { id: session.user.id, role: session.user.role },
  };
}

/**
 * Requires admin panel access (power-management aware) (PC-80).
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
