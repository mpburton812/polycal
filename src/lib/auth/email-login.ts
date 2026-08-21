/**
 * Email-login token helpers. Tokens are full-entropy UUIDs hashed at rest (PC-465).
 */

export const EMAIL_LOGIN_TTL_MS = 15 * 60 * 1000;

/** True when the stored expiry is missing or already in the past. */
export function isEmailLoginTokenExpired(
  expiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt).getTime();
  return Number.isNaN(expires) || now > expires;
}

export function emailLoginExpiresAt(now = Date.now()): string {
  return new Date(now + EMAIL_LOGIN_TTL_MS).toISOString();
}

/**
 * True when Next.js used `redirect()` / Auth.js `signIn` navigation (PC-465).
 * Those errors must be rethrown so the session cookie and destination survive.
 */
export function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
