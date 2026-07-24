import { expect, test } from "./helpers/test";

/**
 * Public privacy policy must be reachable without auth (Google OAuth + in-app links) — PC-344.
 */
test.describe("Privacy policy page", () => {
  test("serves /privacy without redirecting to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect(page.getByText(/Limited Use/i).first()).toBeVisible();
    await expect(page.getByText(/administrators do not have access to any Google Calendar/i)).toBeVisible();
  });

  test("public homepage describes the app and links to privacy", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "PolyCal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
