"use server";

import { signIn } from "@/lib/auth";
import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Switches the active session to another seeded user — non-production only.
 */
export async function impersonateUser(userId: string): Promise<void> {
  if (!isNonProductionEnvironment()) {
    throw new Error("Impersonation is disabled in production.");
  }
  await signIn("credentials", {
    impersonateUserId: userId,
    redirectTo: "/schedule",
  });
}
