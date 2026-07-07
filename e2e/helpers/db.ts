import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_API_SECRET } from "../e2e-env";

const E2E_HEADERS = { "x-e2e-api-secret": E2E_API_SECRET };

/**
 * Resets the E2E database to Star Wars + demo proposal seed via test-only API.
 */
export async function resetE2eDatabase(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/e2e/reset", { headers: E2E_HEADERS });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.ok).toBe(true);
}
