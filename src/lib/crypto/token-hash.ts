import { createHash } from "node:crypto";

/**
 * Hashes a single-use link token for storage at rest (PC-353).
 *
 * Password-reset and email-verification tokens are bearer credentials: whoever
 * holds the raw value can take over the account. Only the SHA-256 digest is
 * persisted so a database leak (or an over-broad admin read) cannot be replayed;
 * the raw token exists solely inside the emailed link. SHA-256 is used instead
 * of a slow KDF because the tokens are full-entropy UUIDs, so offline guessing
 * is infeasible and lookups stay a single indexed comparison.
 */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
