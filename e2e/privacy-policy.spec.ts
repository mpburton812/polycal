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
    // Retention section must describe self-service deletion, not admin-only contact (PC-354).
    await expect(page.getByText(/you can permanently delete your own account/i)).toBeVisible();
    await expect(page.getByText(/Download my data/i).first()).toBeVisible();
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
    await expect(page.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });
});

/**
 * Public terms of service must be reachable without auth for store/PWA compliance — PC-354.
 */
test.describe("Terms of service page", () => {
  test("serves /terms without redirecting to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/terms");
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Eligibility and age rating/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Deleting your account/i })).toBeVisible();
    // Two privacy links exist (inline in §7 and in the footer); the footer one is canonical.
    await expect(page.getByRole("link", { name: "Privacy Policy" }).last()).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});
