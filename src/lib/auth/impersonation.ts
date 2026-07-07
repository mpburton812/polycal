import { isNonProductionEnvironment } from "@/lib/env";

/**
 * Dedicated impersonation secret — never falls back to AUTH_SECRET (PC-76).
 */
export function getImpersonationSecret(): string | null {
  if (!isNonProductionEnvironment()) {
    return null;
  }
  const secret = process.env.AUTH_IMPERSONATION_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

/** Whether impersonation credentials may be used on this deployment. */
export function isImpersonationConfigured(): boolean {
  return getImpersonationSecret() !== null;
}
