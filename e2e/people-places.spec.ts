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

  test("shows seed places collapsed by default on places tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Places" }).click();
    await expect(page.getByRole("heading", { name: "Millennium Falcon", level: 2 })).toBeVisible();
    await expect(page.getByText(/bedrooms · \d+ residents/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Associate" })).not.toBeVisible();
  });

  test("expands place details when chevron clicked", async ({ page }) => {
    await page.getByRole("tab", { name: "Places" }).click();
    await page.getByRole("heading", { name: "Millennium Falcon", level: 2 }).click();
    await expect(page.getByRole("button", { name: "Associate" })).toBeVisible({ timeout: 10_000 });
  });

  test("shows Add place button on places tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Places" }).click();
    await expect(page.getByRole("button", { name: "Add place" })).toBeVisible();
  });

  test("admin can create a new place", async ({ page }) => {
    await page.getByRole("tab", { name: "Places" }).click();
    const placeName = `E2E Hideout ${Date.now()}`;
    await page.getByRole("button", { name: "Add place" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Home name").fill(placeName);
    await dialog.getByRole("button", { name: "Create place" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(placeName)).toBeVisible({ timeout: 15_000 });
  });
});
