import { expect, test } from "./helpers/test";

import { expectAuthenticatedShell, login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed, goToPeoplePlaces, goToProposals, goToSchedule } from "./helpers/navigation";

test.describe("Mobile viewport smoke", () => {
  test("bottom nav, feed, schedule, and proposals tab work on mobile", async ({ page }) => {
    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);

    await expect(page.getByRole("link", { name: "Feed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Proposals" })).toBeVisible();

    await goToFeed(page);
    await expect(page.getByRole("heading", { name: /Feed/i })).toBeVisible();

    await goToProposals(page);
    await expect(page.getByRole("heading", { name: /Proposals/i })).toBeVisible();

    await goToSchedule(page);
    await expect(page.getByRole("button", { name: /Month/i })).toBeVisible();
  });

  test("Add place button stays visible on Places tab", async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);
    await page.getByRole("tab", { name: "Places" }).click();
    const addPlace = page.getByRole("button", { name: "Add place" });
    await expect(addPlace).toBeVisible();
    await expect(addPlace).toBeInViewport();
  });
});
