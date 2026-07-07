"use server";

import { signIn } from "@/lib/auth";
import { getImpersonationSecret } from "@/lib/auth/impersonation";
import { requireAdminAccess } from "@/lib/actions/context";
import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Switches the active session to another seeded user — non-production admins only (PC-59).
 */
export async function impersonateUser(userId: string): Promise<void> {
  if (!isNonProductionEnvironment()) {
    throw new Error("Impersonation is disabled in production.");
  }

  const adminResult = await requireAdminAccess();
  if (!adminResult.ok) {
    throw new Error(adminResult.message);
  }

  const secret = getImpersonationSecret();
  if (!secret) {
    throw new Error("Impersonation is not configured on this server.");
  }

  await signIn("credentials", {
    impersonateUserId: userId,
    impersonateSecret: secret,
    redirectTo: "/schedule",
  });
}
