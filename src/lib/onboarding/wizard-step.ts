/**
 * Pure helpers for first-login wizard step restore after remounts (PC-348 / PC-499).
 */

export const ONBOARDING_STEP_STORAGE_KEY = "polycal.onboarding.activeStep";

/** Highest step the user may click (passed steps + next) — sessionStorage (PC-499). */
export const ONBOARDING_MAX_UNLOCKED_STORAGE_KEY = "polycal.onboarding.maxUnlocked";

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
    // Password already satisfied — never restore Email and Password (step 0) or a
    // remount after setInitialPassword will bounce the user back and stall e2e (PC-510).
    if (!options.mustChangePassword && n < 1) continue;
    return n;
  }
  return fallback;
}

/**
 * Resolves max unlocked step for nonLinear stepper clicks (passed + next).
 * Always at least the start step and the restored active step.
 */
export function resolveOnboardingMaxUnlocked(options: {
  mustChangePassword: boolean;
  storedMaxUnlocked: string | null;
  activeStep: number;
}): number {
  const fallback = options.mustChangePassword ? 0 : 1;
  let stored = fallback;
  if (options.storedMaxUnlocked != null && options.storedMaxUnlocked !== "") {
    const n = Number.parseInt(options.storedMaxUnlocked, 10);
    if (Number.isFinite(n) && n >= 0 && n < ONBOARDING_STEP_COUNT) {
      stored = n;
    }
  }
  // Password still required — never unlock past Email and Password.
  if (options.mustChangePassword) {
    return 0;
  }
  return Math.min(
    ONBOARDING_STEP_COUNT - 1,
    Math.max(fallback, stored, options.activeStep),
  );
}

/**
 * Whether a stepper index may be selected (unlocked = passed + current next).
 */
export function canSelectOnboardingStep(step: number, maxUnlocked: number): boolean {
  return (
    Number.isInteger(step) &&
    step >= 0 &&
    step < ONBOARDING_STEP_COUNT &&
    step <= maxUnlocked
  );
}
