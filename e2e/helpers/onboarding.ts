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
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByText(/Select sleeping partners|No other users yet/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Enable notifications")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Finish setup" }).click();

  const welcomeHeading = page.getByRole("heading", { name: "Welcome!", exact: true });
  if (await welcomeHeading.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Get started" }).click();
  }

  await expectAuthenticatedShell(page);
}
