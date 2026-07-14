import { expect, test } from "./helpers/test";

/**
 * Branded email verification landing — no cryptic JSON (PC-207).
 */
test.describe("Verify email landing", () => {
  test("shows friendly missing-token page without API JSON", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByRole("heading", { name: "Verification link missing" })).toBeVisible();
    await expect(page.getByText(/Open the link from your email/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText(/"ok"\s*:/)).toHaveCount(0);
  });

  test("shows invalid message for a bogus token", async ({ page }) => {
    await page.goto("/verify-email?token=ev-not-a-real-token");
    await expect(page.getByRole("heading", { name: /Link invalid or expired/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue to PolyCal" })).toHaveCount(0);
  });

  test("API verify path redirects to branded landing", async ({ page }) => {
    await page.goto("/api/verify-email?token=ev-not-a-real-token");
    await expect(page).toHaveURL(/\/verify-email\?token=/);
    await expect(page.getByRole("heading", { name: /Link invalid or expired/i })).toBeVisible();
  });
});
