"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { resetTestDatabase } from "@/lib/seed/reset-test-database";
import { isNonProductionEnvironment } from "@/lib/env";

export interface ResetTestDatabaseResult {
  ok: boolean;
  message: string;
  userCount?: number;
  proposalCount?: number;
}

/**
 * Admin-only wipe + reseed for feature/dev/test databases (spec §1.5).
 */
export async function resetTestDatabaseAction(): Promise<ResetTestDatabaseResult> {
  if (!isNonProductionEnvironment()) {
    return { ok: false, message: "Reset is disabled in production." };
  }

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return { ok: false, message: "Admin access required." };
  }

  await ensureDbReady();
  const result = await resetTestDatabase();
  await logUserActivity(session.user.id, "admin.reset_test_database", "Full reseed");

  revalidatePath("/admin");
  revalidatePath("/proposals");
  revalidatePath("/schedule");
  revalidatePath("/api/dev/users");

  return {
    ok: true,
    message: `Test database reset complete (${result.userCount} users, ${result.proposalCount} proposals).`,
    userCount: result.userCount,
    proposalCount: result.proposalCount,
  };
}
