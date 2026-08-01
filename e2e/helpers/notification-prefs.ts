import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_API_SECRET } from "../e2e-env";

/** Seeds raw notification_prefs_json for a username (E2E test API only). */
export async function seedNotificationPrefsJson(
  request: APIRequestContext,
  username: string,
  prefs: Record<string, unknown>,
): Promise<void> {
  const response = await request.post("/api/e2e/notification-prefs", {
    headers: { "x-e2e-api-secret": E2E_API_SECRET },
    data: { username, notificationPrefsJson: JSON.stringify(prefs) },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.ok).toBe(true);
}
