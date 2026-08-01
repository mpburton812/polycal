/**
 * Consumes a notification-email verification token (PC-207).
 */

import { eq } from "drizzle-orm";

import { logUserActivity } from "@/lib/audit";
import { hashLinkToken } from "@/lib/crypto/token-hash";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";

export type VerifyNotificationEmailOutcome =
  | "ok"
  | "missing"
  | "rate_limited"
  | "invalid_or_expired";

/**
 * Verifies a notification email from a mailed token. Rate-limits by clientKey.
 * On success sets emailVerifiedAt and clears the token (24h TTL enforced).
 */
export async function verifyNotificationEmailToken(options: {
  token: string | null | undefined;
  clientKey?: string;
}): Promise<VerifyNotificationEmailOutcome> {
  const token = options.token?.trim() ?? "";
  if (!token) return "missing";

  const rateKey = `verify-email:${options.clientKey ?? "unknown"}`;
  if (!checkRateLimit(rateKey, 20, 60_000)) {
    return "rate_limited";
  }

  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      id: users.id,
      emailVerificationTokenExpiresAt: users.emailVerificationTokenExpiresAt,
    })
    .from(users)
    // Tokens are stored as SHA-256 digests, so look up by digest (PC-353).
    .where(eq(users.emailVerificationToken, hashLinkToken(token)))
    .limit(1);

  if (!row) return "invalid_or_expired";

  if (row.emailVerificationTokenExpiresAt) {
    const expiresAt = new Date(row.emailVerificationTokenExpiresAt).getTime();
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
      return "invalid_or_expired";
    }
  }

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      emailVerifiedAt: now,
      emailVerificationToken: null,
      emailVerificationTokenExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, row.id));

  await logUserActivity(row.id, "profile.notification_email_verified");
  return "ok";
}

/** Builds the public verify landing URL for a token. */
export function buildVerifyEmailLandingUrl(baseUrl: string, token: string): string {
  const base = baseUrl.replace(/\/$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}
