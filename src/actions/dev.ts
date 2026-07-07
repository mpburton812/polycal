"use server";

import { userHasAdminAccess } from "@/lib/admin-access";
import { signIn, auth } from "@/lib/auth";
import { getImpersonationSecret } from "@/lib/auth/impersonation";
import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Switches the active session to another seeded user — non-production admins only (PC-59).
 */
export async function impersonateUser(userId: string): Promise<void> {
  if (!isNonProductionEnvironment()) {
    throw new Error("Impersonation is disabled in production.");
  }

  const session = await auth();
  if (!session?.user || !(await userHasAdminAccess(session.user.role))) {
    throw new Error("Admin access required for impersonation.");
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
