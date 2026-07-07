/** Header name for E2E-only API routes (Playwright harness). */
export const E2E_API_SECRET_HEADER = "x-e2e-api-secret";

/**
 * Returns true when E2E test API routes may run (non-production harness only).
 */
export function isE2eApiEnabled(): boolean {
  if (process.env.E2E_TEST_MODE !== "1") {
    return false;
  }
  if (process.env.NEXT_PUBLIC_APP_ENV === "production") {
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
  return request.headers.get(E2E_API_SECRET_HEADER) === expected;
}
