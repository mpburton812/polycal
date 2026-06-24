import { type Page, expect } from "@playwright/test";

import { SEED_PASSWORD } from "./constants";

/**
 * Signs in via the credentials form and waits for the authenticated shell.
 */
export async function login(
  page: Page,
  username: string,
  password: string = SEED_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(schedule|profile|people-places|proposals|admin)/);
}

/**
 * Signs out by clearing session cookies (faster than hunting for a logout button).
 */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
}

/** Asserts the main bottom navigation is visible (authenticated shell). */
export async function expectAuthenticatedShell(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
}
