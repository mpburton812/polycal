import path from "node:path";

import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProfile } from "./helpers/navigation";

const AVATAR_FIXTURE = path.join(process.cwd(), "public/avatars/bird_red.png");

test.describe("Profile settings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProfile(page);
  });

  test("shows notification quiet hours and alert type controls", async ({ page }) => {
    await expect(page.getByText("Quiet hours")).toBeVisible();
    await expect(page.getByLabel("Start")).toBeVisible();
    await expect(page.getByLabel("End")).toBeVisible();
    await expect(page.getByText("Alert types")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Sleeping proposals" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Event proposals" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Sleeping partner proposals" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Reminders" })).toBeVisible();
  });

  test("saves notification preferences", async ({ page }) => {
    await page.getByLabel("Start").fill("22:00");
    await page.getByLabel("End").fill("07:00");
    await page.getByRole("button", { name: "Save notification preferences" }).click();
    await expect(page.getByText(/Notification preferences saved/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("shows timezone selector in preferences", async ({ page }) => {
    await expect(page.getByLabel("Time zone")).toBeVisible();
    await expect(page.getByLabel("Time zone")).toContainText("UTC");
  });

  test("shows custom avatar upload control", async ({ page }) => {
    await expect(page.getByText("Custom avatar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload image" })).toBeVisible();
  });

  test("uploads a custom avatar image with crop and shows a non-empty preview", async ({ page }) => {
    const input = page.locator('input[type="file"][accept*="image"]');
    await input.setInputFiles(AVATAR_FIXTURE);

    const cropDialog = page.getByRole("dialog", { name: /adjust avatar/i });
    await expect(cropDialog).toBeVisible({ timeout: 10_000 });

    const usePhoto = cropDialog.getByRole("button", { name: "Use photo" });
    await expect(usePhoto).toBeEnabled({ timeout: 15_000 });
    await usePhoto.click();

    await expect(cropDialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(/Could not save avatar/i)).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Custom avatar selected")).toBeVisible({ timeout: 15_000 });

    const customAvatar = page.getByRole("img", { name: "Your custom avatar" });
    await expect(customAvatar).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => customAvatar.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(10);
  });
});
