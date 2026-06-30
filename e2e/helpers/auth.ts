import { type Page, expect } from "@playwright/test";

import { SEED_PASSWORD } from "./constants";
import { completeFirstLoginOnboarding } from "./onboarding";
import { openProfileMenu } from "./navigation";

/**
 * Signs in via the credentials form and waits for the authenticated shell.
 */
export async function login(
  page: Page,
  username: string,
  password: string = SEED_PASSWORD,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto("/login");
    if (!(await page.getByLabel("Username").isVisible().catch(() => false))) {
      await page.context().clearCookies();
      await page.goto("/login");
    }
    await expect(page.getByLabel("Username")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    try {
      await page.waitForURL(/\/(schedule|profile|people-places|proposals|admin|paused)/, {
        timeout: 60_000,
      });
      if (page.url().includes("/paused")) {
        return;
      }
      if (page.url().includes("/schedule")) {
        await page
          .waitForURL(/\/paused/, { timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
      }
      if (!page.url().includes("/login")) {
        return;
      }
    } catch {
      // Retry when Auth.js briefly returns CredentialsSignin under load.
    }
  }

  throw new Error(`Login failed for ${username}`);
}

/**
 * Attempts login and expects failure (invalid credentials page).
 */
export async function expectLoginRejected(page: Page, username: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(SEED_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/Invalid username or password/i)).toBeVisible({
    timeout: 15_000,
  });
}

/**
 * Signs out through the header profile menu (full user journey).
 */
export async function signOutViaMenu(page: Page): Promise<void> {
  await openProfileMenu(page);
  await page.getByRole("menuitem", { name: "Logout" }).click();
  await page.waitForURL(/\/login/);
}

/**
 * Signs out the current user so the next `login` starts from a clean session.
 */
export async function logout(page: Page): Promise<void> {
  const onAuthShell = await page
    .getByRole("navigation", { name: "Main navigation" })
    .isVisible()
    .catch(() => false);

  if (onAuthShell) {
    await signOutViaMenu(page);
  }

  await page.context().clearCookies();
}

/** Asserts the main bottom navigation is visible (authenticated shell). */
export async function expectAuthenticatedShell(page: Page): Promise<void> {
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
}

/**
 * Signs in and completes first-login onboarding when the seed user must change password.
 */
export async function loginWithOnboardingIfNeeded(
  page: Page,
  username: string,
  password: string = SEED_PASSWORD,
): Promise<void> {
  await login(page, username, password);
  const welcome = page.getByRole("heading", { name: "Welcome to PolyCal" });
  if (await welcome.isVisible().catch(() => false)) {
    await completeFirstLoginOnboarding(page, password);
  } else if (page.url().includes("/profile")) {
    await completeFirstLoginOnboarding(page, password);
  }
  await expectAuthenticatedShell(page);
}
