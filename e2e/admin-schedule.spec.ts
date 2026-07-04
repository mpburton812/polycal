import { expect, test, type Page } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin } from "./helpers/navigation";

/** Expands a collapsed admin accordion section by title. */
async function expandAdminSection(page: Page, title: string): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).click();
}

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
    await expect(page.getByRole("heading", { name: "Code Status", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Poly group settings", level: 2 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "System administrator log", level: 2 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test data", level: 2 })).toBeVisible();

    await expandAdminSection(page, "Code Status");
    await expect(page.getByText("Build number", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Made live in this environment", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Check for Update" }),
    ).toBeVisible();
  });

  test("shows user management list with icon actions and no username column", async ({
    page,
  }) => {
    await expandAdminSection(page, "User management");
    await expect(page.getByText("Leia Organa")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Username" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Logins" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Edit ${USERS.leia.displayName}` })).toBeVisible();
  });

  test("shows proposal enforcement settings for admin", async ({ page }) => {
    await expandAdminSection(page, "Poly group settings");
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
