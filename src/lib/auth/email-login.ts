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
