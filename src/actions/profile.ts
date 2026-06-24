"use server";

import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { isUserThemeId, type UserThemeId } from "@/lib/constants/themes";
import { AVATAR_OPTIONS, type AvatarKey } from "@/lib/constants/avatars";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import {
  DEFAULT_NOTIFICATION_PREFS,
  parseNotificationPrefs,
  type NotificationPrefs,
} from "@/types/notification-prefs";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(128, "New password must be 128 characters or fewer."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

function formatPasswordErrors(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join(" ");
}

const AVATAR_KEYS = AVATAR_OPTIONS.map((option) => option.key);

const preferencesSchema = z.object({
  avatarKey: z.string().refine(
    (value): value is AvatarKey => AVATAR_KEYS.includes(value as AvatarKey),
    "Invalid avatar",
  ),
  theme: z.string().refine(isUserThemeId, "Invalid theme"),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Changes the signed-in user's password and clears must-change flag (PC-33).
 */
export async function changePasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: formatPasswordErrors(parsed.error) };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row) {
    return { ok: false, error: "User not found." };
  }

  const valid = await compare(parsed.data.currentPassword, row.passwordHash);
  if (!valid) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "profile.password_change");

  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Updates avatar accent and theme preference (PC-34).
 */
export async function updateProfilePreferencesAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const parsed = preferencesSchema.safeParse({
    avatarKey: formData.get("avatarKey"),
    theme: formData.get("theme"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid avatar or theme selection." };
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      avatarKey: parsed.data.avatarKey,
      theme: parsed.data.theme as UserThemeId,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(
    session.user.id,
    "profile.preferences_update",
    `${parsed.data.avatarKey}, ${parsed.data.theme}`,
  );

  revalidatePath("/profile");
  return { ok: true };
}

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name is required.")
  .max(80, "Display name must be 80 characters or fewer.");

/**
 * Updates the signed-in user's display name (PC-9).
 */
export async function updateDisplayNameAction(displayName: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid display name." };
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ displayName: parsed.data, updatedAt: now })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "profile.display_name_update", parsed.data);
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Loads notification preferences for the signed-in user (PC-9).
 */
export async function getNotificationPrefsAction(): Promise<NotificationPrefs> {
  const session = await auth();
  if (!session?.user?.id) return DEFAULT_NOTIFICATION_PREFS;

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ notificationPrefsJson: users.notificationPrefsJson })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return parseNotificationPrefs(row?.notificationPrefsJson);
}

/**
 * Saves notification preferences (email verification deferred to PC-19).
 */
export async function updateNotificationPrefsAction(
  prefs: NotificationPrefs,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      notificationPrefsJson: JSON.stringify(prefs),
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "profile.notification_prefs_update");
  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Sets password on first login without re-entering the temporary password (PC-10).
 */
export async function setInitialPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const initialPasswordSchema = z
    .object({
      newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters.")
        .max(128, "New password must be 128 characters or fewer."),
      confirmPassword: z.string().min(1, "Confirm your new password."),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "New password and confirmation do not match.",
      path: ["confirmPassword"],
    });

  const parsed = initialPasswordSchema.safeParse({ newPassword, confirmPassword });
  if (!parsed.success) {
    return { ok: false, error: formatPasswordErrors(parsed.error) };
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row) {
    return { ok: false, error: "User not found." };
  }
  if (!row.mustChangePassword) {
    return { ok: false, error: "Use the profile page to change your password." };
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "profile.password_change", "first-login");
  revalidatePath("/profile");
  return { ok: true };
}
