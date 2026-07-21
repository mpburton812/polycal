"use server";

import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { logUserActivity } from "@/lib/audit";
import { newPasswordResetToken } from "@/lib/email/credentials";
import { sendEmail } from "@/lib/email/send";
import { buildPasswordResetEmailContent } from "@/lib/email/templates";
import { getPublicAppUrl } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { checkRateLimitPersistent } from "@/lib/rate-limit";

const GENERIC_REQUEST_MESSAGE =
  "If that account has a verified notification email, we sent a reset link.";

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(32, "Username must be 32 characters or fewer.");

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required."),
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

/**
 * Starts a password reset for a username when a verified notification email exists (PC-162).
 * Always returns the same message (anti-enumeration).
 */
export async function requestPasswordResetAction(
  usernameRaw: string,
  clientIp = "unknown",
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const parsed = usernameSchema.safeParse(usernameRaw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid username." };
  }

  const username = parsed.data.toLowerCase();
  if (
    !(await checkRateLimitPersistent(`password-reset-ip:${clientIp}`, 10, 60_000)) ||
    !(await checkRateLimitPersistent(`password-reset-user:${username}`, 5, 60_000))
  ) {
    return { ok: false, error: "Too many reset requests. Try again in a minute." };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      status: users.status,
      role: users.role,
      notificationEmail: users.notificationEmail,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  // Anti-enumeration: do not reveal whether the user exists or has email.
  if (
    user &&
    user.status === "active" &&
    user.role !== "passive" &&
    user.notificationEmail &&
    user.emailVerifiedAt
  ) {
    const token = newPasswordResetToken();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db
      .update(users)
      .set({
        passwordResetToken: token,
        passwordResetTokenExpiresAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    const resetUrl = `${getPublicAppUrl()}/reset-password?token=${token}`;
    const content = buildPasswordResetEmailContent(resetUrl);
    try {
      const result = await sendEmail({
        to: user.notificationEmail,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      await logUserActivity(
        user.id,
        result.sent ? "auth.password_reset_emailed" : "auth.password_reset_email_skipped",
        JSON.stringify({ to: user.notificationEmail }),
      );
    } catch (error) {
      await logUserActivity(
        user.id,
        "auth.password_reset_email_failed",
        JSON.stringify({
          error: error instanceof Error ? error.message : "send failed",
        }),
        "error",
      );
    }
  }

  return { ok: true, message: GENERIC_REQUEST_MESSAGE };
}

/**
 * Redeems a password-reset token and sets a new password (PC-162).
 */
export async function resetPasswordWithTokenAction(
  input: z.infer<typeof resetPasswordSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (
    !(await checkRateLimitPersistent(
      `password-reset-redeem:${parsed.data.token.slice(0, 16)}`,
      10,
      60_000,
    ))
  ) {
    return { ok: false, error: "Too many attempts. Try again shortly." };
  }

  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.passwordResetToken, parsed.data.token))
    .limit(1);

  if (!user || user.status !== "active" || user.role === "passive") {
    return { ok: false, error: "Invalid or expired reset link." };
  }

  if (user.passwordResetTokenExpiresAt) {
    const expiresAt = new Date(user.passwordResetTokenExpiresAt).getTime();
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
      return { ok: false, error: "Invalid or expired reset link." };
    }
  }

  const passwordHash = await hash(parsed.data.newPassword, 12);
  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      passwordHash,
      mustChangePassword: false,
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
      sessionVersion: user.sessionVersion + 1,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await logUserActivity(user.id, "auth.password_reset_completed");
  return { ok: true };
}
