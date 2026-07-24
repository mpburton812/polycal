import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_API_SECRET } from "../e2e-env";

/**
 * Seeds iCal/Other calendar prefs for a seed user via the E2E harness API (PC-345).
 */
export async function seedIcsCalendarPrefs(
  request: APIRequestContext,
  username: string,
  delivery: "download" | "email" | "both" = "download",
): Promise<void> {
  const response = await request.post("/api/e2e/calendar-ics-prefs", {
    headers: { "x-e2e-api-secret": E2E_API_SECRET },
    data: { username, delivery },
  });
  expect(response.ok(), `seed ICS prefs failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok).toBe(true);
}
