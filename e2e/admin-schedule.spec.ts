import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin } from "./helpers/navigation";

test.describe("Admin", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToAdmin(page);
  });

  test("loads admin panels for admin user", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Poly group settings, user management, and system log"),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Force Reload" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Force reload newest version" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Poly group settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "System administrator log" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test data" })).toBeVisible();
  });

  test("shows user management list with icon actions and no username column", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();
    await expect(page.getByText("Leia Organa")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Username" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Edit ${USERS.leia.displayName}` })).toBeVisible();
  });

  test("shows proposal enforcement settings for admin", async ({ page }) => {
    await expect(page.getByText("Proposal enforcement")).toBeVisible();
    await expect(page.getByLabel("Max hours in proposed")).toBeVisible();
    await expect(page.getByLabel("At-risk draft TTL (hours)")).toBeVisible();
    await expect(page.getByLabel("Archive grace (hours after end)")).toBeVisible();
    await expect(page.getByLabel("Redraft deadline (hours before start)")).toBeVisible();
  });
});

test.describe("Schedule placeholder", () => {
  test("schedule tab loads calendar shell after login", async ({ page }) => {
    await login(page, USERS.luke.username);
    await page.getByRole("link", { name: "Schedule" }).click();
    await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
    await expect(page.getByText(/network calendar/i)).toBeVisible();
  });
});
