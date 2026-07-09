"use server";

import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { logUserActivity } from "@/lib/audit";
import { requireSession, withDb } from "@/lib/actions/context";
import { sendEmail } from "@/lib/email/send";
import { isUserThemeId, normalizeUserThemeId, type UserThemeId } from "@/lib/constants/themes";
import { resolveTimezone } from "@/lib/schedule/timezone";
import { AVATAR_OPTIONS, isCustomAvatarKey, type AvatarKey } from "@/lib/constants/avatars";
import { isCroppedAvatarLargeEnough } from "@/lib/avatars/crop";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { storedImages, users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
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
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Normalizes FormData avatar payload — some runtimes pass Blob instead of File (PC-59).
 */
async function readAvatarUpload(
  formData: FormData,
): Promise<{ ok: true; file: File } | { ok: false; error: string }> {
  const entry = formData.get("avatar");
  if (!entry) {
    return { ok: false, error: "Choose an image file." };
  }

  let file: File;
  if (entry instanceof File) {
    file = entry;
  } else if (typeof entry === "object" && "arrayBuffer" in entry) {
    const blob = entry as Blob;
    file = new File([blob], "avatar", { type: blob.type || "application/octet-stream" });
  } else {
    return { ok: false, error: "Choose an image file." };
  }

  if (file.size === 0) {
    return { ok: false, error: "Choose an image file." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Image must be 2 MB or smaller." };
  }

  if (!isCroppedAvatarLargeEnough(file.size)) {
    return {
      ok: false,
      error: "Image is too small after crop. Zoom in or choose a larger photo.",
    };
  }

  const mimeType = file.type || guessImageMime(file.name);
  if (!ALLOWED_AVATAR_MIMES.has(mimeType)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF." };
  }

  const magicOk = await validateAvatarMagicBytes(file, mimeType);
  if (!magicOk) {
    return { ok: false, error: "File content does not match a supported image format." };
  }

  return { ok: true, file: mimeType === file.type ? file : new File([file], file.name, { type: mimeType }) };
}

/** Infers image MIME from extension when the browser omits `file.type`. */
function guessImageMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

/** Validates file magic bytes match the declared image MIME (PC-59). */
async function validateAvatarMagicBytes(file: File, mimeType: string): Promise<boolean> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (mimeType === "image/jpeg") {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return (
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47
    );
  }
  if (mimeType === "image/gif") {
    return header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  }
  if (mimeType === "image/webp") {
    return (
      header[0] === 0x52 &&
      header[1] === 0x49 &&
      header[2] === 0x46 &&
      header[3] === 0x46 &&
      header[8] === 0x57 &&
      header[9] === 0x45 &&
      header[10] === 0x42 &&
      header[11] === 0x50
    );
  }
  return false;
}

function isValidAvatarKey(value: string): value is AvatarKey | `custom:${string}` {
  if (AVATAR_KEYS.includes(value as AvatarKey)) return true;
  return isCustomAvatarKey(value);
}

const preferencesSchema = z.object({
  avatarKey: z.string().refine(isValidAvatarKey, "Invalid avatar"),
  theme: z.string().refine(isUserThemeId, "Invalid theme"),
  timezone: z.string().min(1).max(64),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export type PasswordActionResult =
  | { ok: true; sessionVersion: number }
  | { ok: false; error: string };

/**
 * Changes the signed-in user's password and clears must-change flag (PC-33).
 */
export async function changePasswordAction(
  formData: FormData,
): Promise<PasswordActionResult> {
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
  const nextSessionVersion = row.sessionVersion + 1;
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      sessionVersion: nextSessionVersion,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "profile.password_change");

  revalidatePath("/profile");
  return { ok: true, sessionVersion: nextSessionVersion };
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
    timezone: formData.get("timezone") ?? "UTC",
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid avatar, theme, or timezone selection." };
  }

  const timezone = resolveTimezone(parsed.data.timezone);

  await ensureDbReady();
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      avatarKey: parsed.data.avatarKey,
      theme: normalizeUserThemeId(parsed.data.theme),
      timezone,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(
    session.user.id,
    "profile.preferences_update",
    `${parsed.data.avatarKey}, ${parsed.data.theme}, ${timezone}`,
  );

  revalidatePath("/profile");
  return { ok: true };
}

/**
 * Stores a user-uploaded avatar in `stored_images` and sets avatarKey (PC-45).
 */
export async function uploadCustomAvatarAction(
  formData: FormData,
): Promise<{ ok: true; avatarKey: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const upload = await readAvatarUpload(formData);
  if (!upload.ok) {
    return upload;
  }
  const file = upload.file;

  const imageId = randomUUID();
  const avatarKey = `custom:${imageId}`;
  const now = new Date().toISOString();

  try {
    await ensureDbReady();
    const db = getDb();

    const [existing] = await db
      .select({ avatarKey: users.avatarKey })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const buffer = Buffer.from(await file.arrayBuffer());
    await db.insert(storedImages).values({
      id: imageId,
      mimeType: file.type,
      data: buffer,
      createdAt: now,
    });

    await db
      .update(users)
      .set({ avatarKey, updatedAt: now })
      .where(eq(users.id, session.user.id));

    if (existing?.avatarKey && isCustomAvatarKey(existing.avatarKey)) {
      const orphanId = existing.avatarKey.slice("custom:".length);
      await db.delete(storedImages).where(eq(storedImages.id, orphanId));
    }

    await logUserActivity(session.user.id, "profile.custom_avatar_upload", imageId);
    revalidatePath("/profile");
    return { ok: true, avatarKey };
  } catch (error) {
    console.error("uploadCustomAvatarAction failed:", error);
    return { ok: false, error: "Could not save avatar. Try a smaller image or another format." };
  }
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
  const sessionResult = await requireSession();
  if (!sessionResult.ok) {
    return { ok: false, error: sessionResult.message };
  }

  const parsed = displayNameSchema.safeParse(displayName);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid display name." };
  }

  await withDb(async (db) => {
    const now = new Date().toISOString();
    await db
      .update(users)
      .set({ displayName: parsed.data, updatedAt: now })
      .where(eq(users.id, sessionResult.user.id));
  });

  await logUserActivity(sessionResult.user.id, "profile.display_name_update", parsed.data);
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

const notificationEmailSchema = z.string().trim().email("Enter a valid email address.");

/**
 * Saves notification email and sends a verification link when email is configured (PC-53).
 */
export async function updateNotificationEmailAction(
  email: string,
): Promise<{ ok: true; verificationUrl?: string } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Not signed in." };
  }

  const parsed = notificationEmailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  if (!checkRateLimit(`notification-email:${session.user.id}`, 5, 60_000)) {
    return { ok: false, error: "Too many verification requests. Try again in a minute." };
  }

  await ensureDbReady();
  const db = getDb();
  const token = `ev-${randomUUID()}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await db
    .update(users)
    .set({
      notificationEmail: parsed.data,
      emailVerifiedAt: null,
      emailVerificationToken: token,
      emailVerificationTokenExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const verificationUrl = `${baseUrl}/api/verify-email?token=${token}`;

  await logUserActivity(
    session.user.id,
    "profile.notification_email_pending",
    JSON.stringify({ email: parsed.data }),
  );

  try {
    const sendResult = await sendEmail({
      to: parsed.data,
      subject: "Verify your PolyCal notification email",
      html: `<p>Click to verify your PolyCal notification email:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p>`,
    });
    if (!sendResult.sent) {
      await logUserActivity(
        session.user.id,
        "profile.notification_email_dev_link",
        JSON.stringify({ email: parsed.data, verificationPending: true }),
      );
    }
  } catch (error) {
    await logUserActivity(
      session.user.id,
      "profile.notification_email_send_failed",
      JSON.stringify({
        error: error instanceof Error ? error.message : "send failed",
        email: parsed.data,
      }),
      "error",
    );
  }

  revalidatePath("/profile");
  return { ok: true, verificationUrl };
}

/**
 * Loads notification email state for the signed-in user (PC-43).
 */
export async function getNotificationEmailAction(): Promise<{
  email: string | null;
  verified: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) return { email: null, verified: false };

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      notificationEmail: users.notificationEmail,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return {
    email: row?.notificationEmail ?? null,
    verified: Boolean(row?.emailVerifiedAt),
  };
}

/**
 * Sets password on first login without re-entering the temporary password (PC-10).
 */
export async function setInitialPasswordAction(
  formData: FormData,
): Promise<PasswordActionResult> {
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
  const nextSessionVersion = row.sessionVersion + 1;
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      sessionVersion: nextSessionVersion,
      updatedAt: now,
    })
    .where(eq(users.id, session.user.id));

  await logUserActivity(session.user.id, "profile.password_change", "first-login");
  revalidatePath("/profile");
  return { ok: true, sessionVersion: nextSessionVersion };
}
