"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { AVATAR_OPTIONS, isCustomAvatarKey, type AvatarKey } from "@/lib/constants/avatars";
import { isUserThemeId, normalizeUserThemeId, type UserThemeId } from "@/lib/constants/themes";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { loadNetworkSettings } from "@/lib/networks/settings";
import { resolveTimezone } from "@/lib/schedule/timezone";
import { DEFAULT_ONBOARDING_WELCOME_MESSAGE } from "@/types/network-settings";
import { profileBioSchema } from "@/lib/users/profile-bio";

const AVATAR_KEYS = AVATAR_OPTIONS.map((option) => option.key);

function isValidAvatarKey(value: string): value is AvatarKey | `custom:${string}` {
  if (AVATAR_KEYS.includes(value as AvatarKey)) return true;
  return isCustomAvatarKey(value);
}

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
 * Persists avatar and theme during first-login onboarding without FormData (PC-52 E2E).
 */
export async function saveOnboardingPreferencesAction(input: {
  avatarKey: string;
  theme: string;
  /** Account IANA timezone; falls back to America/New_York when invalid (PC-376). */
  timezone?: string;
  profileBio?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  if (!isValidAvatarKey(input.avatarKey) || !isUserThemeId(input.theme)) {
    return { ok: false, error: "Invalid avatar or theme selection." };
  }

  const bioParsed = profileBioSchema.safeParse(input.profileBio ?? "");
  if (!bioParsed.success) {
    return { ok: false, error: bioParsed.error.issues[0]?.message ?? "Invalid bio." };
  }

  const timezone = resolveTimezone(input.timezone);

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      avatarKey: input.avatarKey,
      theme: normalizeUserThemeId(input.theme),
      timezone,
      profileBio: bioParsed.data,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(
    session.user.id,
    "onboarding.preferences",
    `${input.avatarKey}, ${input.theme}, ${timezone}`,
  );

  revalidatePath("/profile");
  revalidatePath("/people-places");
  return { ok: true };
}

/**
 * Loads the welcome message after notification prefs are saved (PC-156).
 * Does not mark onboarding complete — that happens only when the user clicks OK.
 */
export async function prepareOnboardingWelcomeAction(): Promise<{
  ok: boolean;
  message: string;
  welcomeMessage?: string;
}> {
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

  const networkId = session.user.activeNetworkId;
  const settings = networkId ? await loadNetworkSettings(networkId, db) : null;
  const welcomeMessage =
    settings?.onboardingWelcomeMessage?.trim() || DEFAULT_ONBOARDING_WELCOME_MESSAGE;

  return { ok: true, message: "Welcome ready.", welcomeMessage };
}

/**
 * Marks first-login onboarding complete after the user acknowledges Welcome (PC-10 / PC-156).
 */
export async function completeOnboardingAction(): Promise<{
  ok: boolean;
  message: string;
  welcomeMessage?: string;
}> {
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

  const networkId = session.user.activeNetworkId;
  const settings = networkId ? await loadNetworkSettings(networkId, db) : null;
  const welcomeMessage =
    settings?.onboardingWelcomeMessage?.trim() || DEFAULT_ONBOARDING_WELCOME_MESSAGE;

  if (!row.onboardingComplete) {
    const now = new Date().toISOString();
    await db
      .update(users)
      .set({ onboardingComplete: true, updatedAt: now })
      .where(eq(users.id, session.user.id));

    await logUserActivity(session.user.id, "onboarding.complete");
    revalidatePath("/");
    revalidatePath("/feed");
    revalidatePath("/schedule");
  }

  return { ok: true, message: "Onboarding complete.", welcomeMessage };
}
