import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Dedicated impersonation secret — never falls back to AUTH_SECRET (PC-76 / PC-179).
 * Production is allowed when AUTH_IMPERSONATION_SECRET is explicitly set (admin User management only).
 * Test-data seed APIs remain gated by isNonProductionEnvironment elsewhere.
 */
export function getImpersonationSecret(): string | null {
  const secret = process.env.AUTH_IMPERSONATION_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

/** Whether admin impersonation credentials may be used on this deployment. */
export function isImpersonationConfigured(): boolean {
  return getImpersonationSecret() !== null;
}

/**
 * True when the Test data / DevBar impersonation UI may mount (never on production).
 */
export function isDevImpersonationUiEnabled(): boolean {
  return isNonProductionEnvironment() && isImpersonationConfigured();
}
