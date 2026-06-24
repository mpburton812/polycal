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
    await expect(page.getByRole("heading", { name: "Poly group settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Test data" })).toBeVisible();
  });

  test("shows user management list with seed users", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();
    await expect(page.getByText("Leia Organa")).toBeVisible();
  });
});

test.describe("Schedule placeholder", () => {
  test("schedule tab shows phase placeholder", async ({ page }) => {
    await login(page, USERS.luke.username);
    await page.getByRole("link", { name: "Schedule" }).click();
    await expect(page.getByText(/Phase 6|Calendar views/i)).toBeVisible();
  });
});
