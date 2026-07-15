import { type Page, expect } from "@playwright/test";

import { expectAuthenticatedShell } from "./auth";

/**
 * Completes the first-login wizard for a freshly provisioned active user.
 */
export async function completeFirstLoginOnboarding(
  page: Page,
  newPassword: string,
): Promise<void> {
  await expect(page.getByRole("heading", { name: "Welcome to PolyCal" })).toBeVisible();

  await page.getByRole("textbox", { name: "New password", exact: true }).fill(newPassword);
  await page.getByRole("textbox", { name: "Confirm new password" }).fill(newPassword);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Accent theme")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Blue bird" }).click();
  // Timezone defaults to US Eastern (PC-194).
  await expect(page.getByLabel("Time zone")).toContainText("America/New_York");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText(/Select sleeping partners|No other users yet/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Enable notifications")).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Notification email").fill("e2e-onboard@example.com");
  await page.getByRole("button", { name: "Finish setup" }).click();

  // Welcome must stay until OK — onboarding is not complete until acknowledge (PC-156).
  await expect(page.getByRole("heading", { name: "Welcome!", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "OK", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();

  // Wait until the welcome ack leaves the shell (onboardingComplete applied) (PC-156 / PC-225).
  await expect(page.getByRole("heading", { name: "Welcome!", exact: true })).toBeHidden({
    timeout: 30_000,
  });
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Feed", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expectAuthenticatedShell(page);
}
