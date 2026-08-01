import { timingSafeEqualStrings } from "@/lib/crypto/timing-safe-equal";

/** Header name for E2E-only API routes (Playwright harness). */
export const E2E_API_SECRET_HEADER = "x-e2e-api-secret";

/**
 * Returns true when E2E test API routes may run (non-production harness only).
 *
 * These routes mutate data with no user authorization, so the gate fails closed
 * on every independent signal of "this might be production": the deployment
 * tier, the Node environment, and the database the process is pointed at
 * (PC-353). The database check matters most — a misconfigured preview deploy
 * with `NEXT_PUBLIC_APP_ENV` unset could otherwise expose the harness against
 * real production rows.
 */
export function isE2eApiEnabled(): boolean {
  if (process.env.E2E_TEST_MODE !== "1") {
    return false;
  }

  const tier = process.env.NEXT_PUBLIC_APP_ENV?.trim();
  if (tier === "production") {
    return false;
  }

  // `NODE_ENV=production` is normal for the CI harness (Playwright runs against
  // a production build), so it only disables the routes when the tier has not
  // been explicitly declared non-production.
  const tierIsExplicitlyNonProduction =
    tier === "feature" || tier === "dev" || tier === "test";
  if (process.env.NODE_ENV === "production" && !tierIsExplicitlyNonProduction) {
    return false;
  }

  if (process.env.TURSO_DATABASE_URL?.includes("polycal-prod")) {
    return false;
  }

  return Boolean(process.env.E2E_API_SECRET);
}

/**
 * Validates the shared secret on E2E harness requests (PC-75).
 */
export function isE2eApiAuthorized(request: Request): boolean {
  if (!isE2eApiEnabled()) {
    return false;
  }
  const expected = process.env.E2E_API_SECRET;
  if (!expected) {
    return false;
  }
  return timingSafeEqualStrings(request.headers.get(E2E_API_SECRET_HEADER), expected);
}
