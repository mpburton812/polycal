import { expect, test } from "./helpers/test";

import { login, logout, expectAuthenticatedShell } from "./helpers/auth";
import { SEED_PASSWORD, USERS } from "./helpers/constants";

test.describe("Authentication", () => {
  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("luke");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Auth.js credentials failure keeps the user on login (error param or sign-in form).
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("admin user signs in and reaches schedule shell", async ({ page }) => {
    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await expect(page.getByText(/Phase 6|Calendar views/i)).toBeVisible();
  });

  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/proposals");
    await expect(page).toHaveURL(/\/login/);
  });

  test("seed hint is visible on login page in non-production", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/luke.*ChangeMe123!/i)).toBeVisible();
  });

  test("session persists across navigation", async ({ page }) => {
    await login(page, USERS.luke.username);
    await page.getByRole("link", { name: "Proposals" }).click();
    await expect(page).toHaveURL(/\/proposals/);
    await logout(page);
    await page.goto("/proposals");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Credentials gate", () => {
  test("standard user without password change can access proposals", async ({ page }) => {
    await login(page, USERS.yoda.username, SEED_PASSWORD);
    await page.getByRole("link", { name: "Proposals" }).click();
    await expect(page.getByRole("heading", { name: "Proposals", level: 1 })).toBeVisible();
  });
});
