import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_API_SECRET } from "../e2e-env";

/** POST JSON to an E2E harness route with the shared secret header. */
export async function e2eApiPost<T extends { ok?: boolean }>(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
): Promise<T> {
  const response = await request.post(path, {
    headers: { "x-e2e-api-secret": E2E_API_SECRET },
    data,
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as T;
  expect(body.ok).toBe(true);
  return body;
}
