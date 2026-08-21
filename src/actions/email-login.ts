"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionFailure } from "@/lib/actions/result";
import { logUserActivity } from "@/lib/audit";
import { signIn } from "@/lib/auth";
import { emailLoginExpiresAt, isNextRedirectError } from "@/lib/auth/email-login";
import { hashLinkToken } from "@/lib/crypto/token-hash";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { newEmailLoginToken } from "@/lib/email/credentials";
import { sendEmail } from "@/lib/email/send";
import { buildEmailLoginContent } from "@/lib/email/templates";
import { getPublicAppUrl } from "@/lib/env";
import { getClientIpFromHeaders } from "@/lib/http/client-ip";
import { checkRateLimitPersistent } from "@/lib/rate-limit";

const GENERIC_REQUEST_MESSAGE =
  "If that account has a verified notification email, we sent a login link.";

const usernameSchema = z
  .string()
  .trim()
  .min(2, "Username must be at least 2 characters.")
  .max(32, "Username must be 32 characters or fewer.");

/**
 * Starts a passwordless email login. Always returns the same message (anti-enumeration)
 * and never sets mustChangePassword (PC-465).
 */
export async function requestEmailLoginAction(
  usernameRaw: string,
): Promise<{ ok: true; message: string } | ActionFailure> {
  const parsed = usernameSchema.safeParse(usernameRaw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid username." };
  }

  const clientIp = getClientIpFromHeaders(await headers());
  const username = parsed.data.toLowerCase();
  if (
    !(await checkRateLimitPersistent(`email-login-ip:${clientIp}`, 10, 60_000)) ||
    !(await checkRateLimitPersistent(`email-login-user:${username}`, 5, 60_000))
  ) {
    return { ok: false, message: "Too many login requests. Try again in a minute." };
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

  if (
    user &&
    user.status === "active" &&
    user.role !== "passive" &&
    user.notificationEmail &&
    user.emailVerifiedAt
  ) {
    const token = newEmailLoginToken();
    const now = new Date().toISOString();
    await db
      .update(users)
      .set({
        emailLoginToken: hashLinkToken(token),
        emailLoginTokenExpiresAt: emailLoginExpiresAt(),
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    const loginUrl = `${getPublicAppUrl()}/login/email?token=${token}`;
    const content = buildEmailLoginContent(loginUrl);
    try {
      const result = await sendEmail({
        to: user.notificationEmail,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      await logUserActivity(
        user.id,
        result.sent ? "auth.email_login_requested" : "auth.email_login_email_skipped",
        JSON.stringify({ to: user.notificationEmail }),
      );
    } catch (error) {
      await logUserActivity(
        user.id,
        "auth.email_login_email_failed",
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
 * Completes email login from the magic-link page form (PC-465).
 * Must run as a server action so Auth.js can set the session cookie.
 */
export async function redeemEmailLoginAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    redirect("/login?error=CredentialsSignin");
  }
  try {
    await signIn("credentials", {
      emailLoginToken: token,
      redirectTo: "/feed",
    });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    redirect("/login?error=CredentialsSignin");
  }
}
