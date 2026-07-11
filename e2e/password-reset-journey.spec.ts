import { expect, test } from "@playwright/test";

import { E2E_API_SECRET } from "./e2e-env";
import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resetE2eDatabase } from "./helpers/db";

// Public forgot/reset must start logged out despite project luke storageState (PC-175).
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Forgot / reset password public flow (PC-162).
 */
test.describe("password reset journey", () => {
  test("forgot password shows generic success and reset link updates password", async ({
    page,
    request,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);

    await page.getByLabel("Username").fill(USERS.luke.username);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(/If that account has a verified notification email/i),
    ).toBeVisible();

    // Unknown username gets the same message (anti-enumeration).
    await page.getByLabel("Username").fill("definitely-not-a-user");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(/If that account has a verified notification email/i),
    ).toBeVisible();

    const token = `pr-e2e-${Date.now()}`;
    const seed = await request.post("/api/e2e/password-reset-token", {
      headers: { "x-e2e-api-secret": E2E_API_SECRET },
      data: { username: USERS.luke.username, token },
    });
    expect(seed.ok()).toBeTruthy();

    const newPassword = "ResetPass123!";
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await expect(page.getByText(/Password updated/i)).toBeVisible();

    await login(page, USERS.luke.username, newPassword);
    await expect(page).toHaveURL(/\/schedule/);

    // Restore Star Wars seed so later journeys still use the default password.
    await resetE2eDatabase(request);
  });
});
