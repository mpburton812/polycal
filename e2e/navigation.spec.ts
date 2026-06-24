import { expect, test } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  goToAdmin,
  goToPeoplePlaces,
  goToProfile,
  goToProposals,
  goToSchedule,
  openProfileMenu,
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
    await expect(page.getByText("Rebel Alliance")).toBeVisible();
    await expect(page.getByText("PolyCal", { exact: true })).toBeVisible();
  });

  test("profile menu opens settings and logout entries", async ({ page }) => {
    await openProfileMenu(page);
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Logout" })).toBeVisible();
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

    await goToProfile(page);
    await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
  });
});

test.describe("App navigation (standard user)", () => {
  test("non-admin user does not see Admin tab", async ({ page }) => {
    await login(page, USERS.han.username);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });
});
