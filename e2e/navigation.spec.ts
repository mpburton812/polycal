import { expect, test } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  goToAdmin,
  goToPeoplePlaces,
  goToProposals,
  goToSchedule,
} from "./helpers/navigation";

test.describe("App navigation (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
  });

  test("bottom nav includes Schedule, Proposals, People & Places, and Admin for admin", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Proposals" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "People & Places" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
  });

  test("navigates to all primary tabs", async ({ page }) => {
    await goToSchedule(page);
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();

    await goToProposals(page);
    await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();

    await goToPeoplePlaces(page);
    await expect(page.getByRole("heading", { name: "People & Places" })).toBeVisible();

    await goToAdmin(page);
    await expect(page.getByRole("heading", { name: "Admin", level: 1 })).toBeVisible();
  });
});

test.describe("App navigation (standard user)", () => {
  test("non-admin user does not see Admin tab", async ({ page }) => {
    await login(page, USERS.han.username);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });
});
