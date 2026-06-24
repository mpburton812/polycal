import { type APIRequestContext, expect } from "@playwright/test";

/**
 * Resets the E2E database to Star Wars + demo proposal seed via test-only API.
 */
export async function resetE2eDatabase(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/e2e/reset");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.ok).toBe(true);
}
