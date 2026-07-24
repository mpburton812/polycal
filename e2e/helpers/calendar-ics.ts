import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_API_SECRET } from "../e2e-env";

function apiUrl(origin: string | undefined, path: string): string {
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Seeds iCal/Other calendar prefs for a seed user via the E2E harness API (PC-345).
 * Pass absolute `origin` so the write hits the same worker DB as the browser.
 */
export async function seedIcsCalendarPrefs(
  request: APIRequestContext,
  username: string,
  delivery: "download" | "email" | "both" = "download",
  origin?: string,
): Promise<void> {
  const response = await request.post(apiUrl(origin, "/api/e2e/calendar-ics-prefs"), {
    headers: { "x-e2e-api-secret": E2E_API_SECRET },
    data: { username, delivery },
  });
  expect(response.ok(), `seed ICS prefs failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok).toBe(true);
}

/**
 * Re-runs calendar sync for a proposal by title so pending ICS exists for assertions (PC-345).
 */
export async function forceIcsCalendarSync(
  request: APIRequestContext,
  username: string,
  title: string,
  origin?: string,
): Promise<string> {
  const response = await request.post(apiUrl(origin, "/api/e2e/calendar-ics-sync"), {
    headers: { "x-e2e-api-secret": E2E_API_SECRET },
    data: { username, title },
  });
  expect(response.ok(), `force ICS sync failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { ok?: boolean; pendingId?: string | null };
  expect(body.ok).toBe(true);
  expect(body.pendingId, "expected pending ICS after force sync").toBeTruthy();
  return body.pendingId as string;
}
