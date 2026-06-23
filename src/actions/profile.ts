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

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

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
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
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
