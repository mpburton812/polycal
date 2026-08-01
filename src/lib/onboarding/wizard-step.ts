/**
 * Pure helpers for first-login wizard step restore after remounts (PC-348).
 */

export const ONBOARDING_STEP_STORAGE_KEY = "polycal.onboarding.activeStep";

/** Calendar step index — restored after Google OAuth remount (PC-348). */
export const ONBOARDING_CALENDAR_STEP = 4;

export const ONBOARDING_STEP_COUNT = 6;

/**
 * Resolves the wizard step after a remount (OAuth round-trip) from query or sessionStorage.
 */
export function resolveOnboardingStartStep(options: {
  mustChangePassword: boolean;
  queryStep: string | null;
  storedStep: string | null;
}): number {
  const fallback = options.mustChangePassword ? 0 : 1;
  const candidates = [options.queryStep, options.storedStep];
  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) continue;
    if (n < 0 || n >= ONBOARDING_STEP_COUNT) continue;
    // Cannot skip password while mustChangePassword is still required.
    if (options.mustChangePassword && n > 0) continue;
    return n;
  }
  return fallback;
}
