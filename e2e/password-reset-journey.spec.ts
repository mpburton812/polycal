import { E2E_API_SECRET } from "./e2e-env";
import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resetE2eDatabase } from "./helpers/db";
import { emptyStorageState, expect, test } from "./helpers/test";

// Public forgot/reset must start logged out despite project luke storageState (PC-175).
test.use({ storageState: emptyStorageState });

/**
 * Forgot / reset password public flow (PC-162).
 */
test.describe("password reset journey", () => {
  test("forgot password shows generic success and reset link updates password", async ({
    page,
    request,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await page.goto("/forgot-password", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeEnabled();

    const usernameField = page.getByRole("textbox", { name: "Username" });
    await usernameField.fill(USERS.luke.username);
    await expect(usernameField).toHaveValue(USERS.luke.username);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(/If that account has a verified notification email/i),
    ).toBeVisible({ timeout: 30_000 });

    // Unknown username gets the same message (anti-enumeration).
    await usernameField.fill("definitely-not-a-user");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByText(/If that account has a verified notification email/i),
    ).toBeVisible({ timeout: 30_000 });

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
    await expect(page).toHaveURL(/\/feed/);

    // Restore Star Wars seed so later journeys still use the default password.
    await resetE2eDatabase(request);
  });
});
