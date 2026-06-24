"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";

export interface OnboardingStatus {
  needsOnboarding: boolean;
  mustChangePassword: boolean;
}

/**
 * Returns whether the signed-in user must complete first-login onboarding (PC-10).
 */
export async function getOnboardingStatusAction(): Promise<OnboardingStatus | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      onboardingComplete: users.onboardingComplete,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!row) return null;

  return {
    needsOnboarding: !row.onboardingComplete,
    mustChangePassword: row.mustChangePassword,
  };
}

/**
 * Marks first-login onboarding complete after wizard finishes (PC-10).
 */
export async function completeOnboardingAction(): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Not signed in." };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!row) {
    return { ok: false, message: "User not found." };
  }

  if (row.mustChangePassword) {
    return { ok: false, message: "Change your password before finishing onboarding." };
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ onboardingComplete: true, updatedAt: now })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "onboarding.complete");
  revalidatePath("/");
  return { ok: true, message: "Welcome to PolyCal!" };
}
