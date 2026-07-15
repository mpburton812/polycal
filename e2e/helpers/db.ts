import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_API_SECRET } from "../e2e-env";

const E2E_HEADERS = { "x-e2e-api-secret": E2E_API_SECRET };

/**
 * Resets the E2E database to Star Wars + demo proposal seed via test-only API.
 * Retries briefly when the serial worker's server is still recovering (PC-224).
 */
export async function resetE2eDatabase(request: APIRequestContext): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await request.post("/api/e2e/reset", {
        headers: E2E_HEADERS,
        timeout: 60_000,
      });
      if (!response.ok()) {
        throw new Error(`E2E reset HTTP ${response.status()}`);
      }
      const body = (await response.json()) as { ok?: boolean };
      if (!body.ok) {
        throw new Error("E2E reset returned ok:false");
      }
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  expect(lastError, "E2E database reset failed after retries").toBeNull();
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
