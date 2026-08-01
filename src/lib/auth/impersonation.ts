import { timingSafeEqualStrings } from "@/lib/crypto/timing-safe-equal";
import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Dedicated impersonation secret — never falls back to AUTH_SECRET (PC-76 / PC-179).
 * Test-data seed APIs remain gated by isNonProductionEnvironment elsewhere.
 */
export function getImpersonationSecret(): string | null {
  const secret = process.env.AUTH_IMPERSONATION_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

/**
 * Whether impersonation is permitted on this deployment tier (PC-353).
 *
 * Impersonation lets an admin act fully as another person, so it is denied on
 * production by default even when a secret is configured. Break-glass support
 * work must set ALLOW_PROD_IMPERSONATION=1 explicitly, which makes enabling it
 * a deliberate, reviewable environment change rather than a side effect of
 * having the secret present.
 */
export function isImpersonationAllowedForEnvironment(): boolean {
  return (
    isNonProductionEnvironment() || process.env.ALLOW_PROD_IMPERSONATION?.trim() === "1"
  );
}

/** Whether admin impersonation credentials may be used on this deployment. */
export function isImpersonationConfigured(): boolean {
  return getImpersonationSecret() !== null && isImpersonationAllowedForEnvironment();
}

/**
 * Constant-time check of a caller-supplied impersonation secret (PC-353).
 * Returns false when impersonation is unconfigured or barred on this tier.
 */
export function isValidImpersonationSecret(candidate: unknown): boolean {
  if (!isImpersonationAllowedForEnvironment()) {
    return false;
  }
  const secret = getImpersonationSecret();
  if (!secret || typeof candidate !== "string") {
    return false;
  }
  return timingSafeEqualStrings(candidate, secret);
}

/**
 * True when the Test data / DevBar impersonation UI may mount (never on production).
 */
export function isDevImpersonationUiEnabled(): boolean {
  return isNonProductionEnvironment() && getImpersonationSecret() !== null;
}
