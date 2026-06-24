import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToPeoplePlaces } from "./helpers/navigation";

test.describe("People & Places", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);
  });

  test("shows people on the people tab", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "People & Places", level: 1 })).toBeVisible();
    await expect(page.getByText("Luke Skywalker")).toBeVisible();
    await expect(page.getByText("Leia Organa")).toBeVisible();
  });

  test("shows seed places on the places tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Places" }).click();
    await expect(page.getByText("Millennium Falcon")).toBeVisible();
  });

  test("admin can create a new place", async ({ page }) => {
    await page.getByRole("tab", { name: "Places" }).click();
    await page.getByLabel("Home name").fill(`E2E Hideout ${Date.now()}`);
    await page.getByRole("button", { name: "Create place" }).click();
    await expect(page.getByText(/Created place/i)).toBeVisible({ timeout: 15_000 });
  });
});
