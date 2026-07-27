import { expect, test } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  goToAdmin,
  goToFeed,
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

  test("bottom nav includes Feed first, then Schedule, Proposals, People & Places, and Admin", async ({
    page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const links = nav.getByRole("link");
    await expect(links.nth(0)).toHaveText("Feed");
    await expect(nav.getByRole("link", { name: "Feed" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Proposals" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "People & Places" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Admin" })).toBeVisible();
    const banner = page.getByRole("banner");
    // Network label is poly_group name or switcher value; MUI may render it twice in the banner (PC-357).
    await expect(banner.getByText("Rebel Alliance", { exact: true }).first()).toBeVisible();
    // Scope to the app banner — document <title> also reads "PolyCal" and fails strict mode.
    await expect(banner.getByText("PolyCal", { exact: true })).toBeVisible();
  });

  test("login lands on Feed as default home tab", async ({ page }) => {
    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
  });

  test("profile menu opens settings and logout entries", async ({ page }) => {
    await openProfileMenu(page);
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Logout" })).toBeVisible();
  });

  test("navigates to all primary tabs", async ({ page }) => {
    await goToFeed(page);
    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();

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
