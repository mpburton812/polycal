import { type APIRequestContext, expect } from "@playwright/test";

import { E2E_CRON_SECRET } from "../e2e-env";

/** Triggers the enforcement cron (includes event reminders) using the E2E CRON_SECRET. */
export async function runEnforcementCron(request: APIRequestContext): Promise<{ remindersSent: number }> {
  const response = await request.get("/api/cron/enforcement", {
    headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { ok: boolean; remindersSent?: number };
  expect(body.ok).toBe(true);
  return { remindersSent: body.remindersSent ?? 0 };
}
