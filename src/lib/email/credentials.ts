/**
 * Helpers for emailing provisioned credentials (PC-161).
 */

import { randomUUID } from "node:crypto";

import { logUserActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import {
  buildCredentialsEmailContent,
  buildVerifyEmailContent,
} from "@/lib/email/templates";
import { getPublicAppUrl } from "@/lib/env";
import { buildLoginInstructions } from "@/lib/users/credentials";

export interface CredentialsEmailResult {
  emailed: boolean;
  loginInstructions: string;
  /** Present when email was not sent so the admin UI can show a fallback verify link. */
  verificationUrl?: string;
}

/**
 * Builds clipboard login text and optionally emails credentials (+ verify link).
 * Never logs the plaintext password.
 */
export async function deliverLoginCredentials(options: {
  actorUserId: string | null;
  targetUserId: string;
  username: string;
  password: string;
  toEmail?: string | null;
  includeVerifyLink?: boolean;
  verifyToken?: string | null;
}): Promise<CredentialsEmailResult> {
  const baseUrl = getPublicAppUrl();
  const loginUrl = `${baseUrl}/login`;
  const loginInstructions = buildLoginInstructions({
    username: options.username,
    password: options.password,
    appUrl: baseUrl,
  });

  const verifyUrl =
    options.includeVerifyLink && options.verifyToken
      ? `${baseUrl}/verify-email?token=${options.verifyToken}`
      : undefined;

  if (!options.toEmail?.trim()) {
    return { emailed: false, loginInstructions, verificationUrl: verifyUrl };
  }

  const content = buildCredentialsEmailContent({
    username: options.username,
    password: options.password,
    loginUrl,
    verifyUrl,
  });

  try {
    const result = await sendEmail({
      to: options.toEmail.trim(),
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    if (result.sent) {
      await logUserActivity(
        options.actorUserId,
        "user.credentials_emailed",
        JSON.stringify({ userId: options.targetUserId, to: options.toEmail.trim() }),
      );
      return { emailed: true, loginInstructions };
    }
    await logUserActivity(
      options.actorUserId,
      "user.credentials_email_skipped",
      JSON.stringify({
        userId: options.targetUserId,
        to: options.toEmail.trim(),
        detail: result.detail ?? "log-only",
      }),
    );
    return { emailed: false, loginInstructions, verificationUrl: verifyUrl };
  } catch (error) {
    await logUserActivity(
      options.actorUserId,
      "user.credentials_email_failed",
      JSON.stringify({
        userId: options.targetUserId,
        to: options.toEmail.trim(),
        error: error instanceof Error ? error.message : "send failed",
      }),
      "error",
    );
    return { emailed: false, loginInstructions, verificationUrl: verifyUrl };
  }
}

/**
 * Creates a 24h notification-email verification token id.
 */
export function newEmailVerificationToken(): string {
  return `ev-${randomUUID()}`;
}

/**
 * Creates a 1h password-reset token id.
 */
export function newPasswordResetToken(): string {
  return `pr-${randomUUID()}`;
}

/**
 * Creates a 15-minute email-login token id (PC-465).
 */
export function newEmailLoginToken(): string {
  return `el-${randomUUID()}`;
}

/**
 * Sends a standalone verification email (profile flow).
 */
export async function sendVerificationEmail(options: {
  to: string;
  verificationUrl: string;
}): Promise<{ sent: boolean }> {
  const content = buildVerifyEmailContent(options.verificationUrl);
  const result = await sendEmail({
    to: options.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
  return { sent: result.sent };
}
