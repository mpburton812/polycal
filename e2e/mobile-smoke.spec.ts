import { expect, test } from "./helpers/test";

import { expectAuthenticatedShell, login } from "./helpers/auth";
import { USERS } from "./helpers/constants";

test.describe("Mobile viewport smoke", () => {
  test("bottom nav, schedule, and proposals tab work on mobile", async ({ page }) => {
    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);

    await expect(page.getByRole("link", { name: "Schedule" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Proposals" })).toBeVisible();

    await page.getByRole("link", { name: "Proposals" }).click();
    await expect(page).toHaveURL(/\/proposals/);
    await expect(page.getByRole("heading", { name: /Proposals/i })).toBeVisible();

    await page.getByRole("link", { name: "Schedule" }).click();
    await expect(page).toHaveURL(/\/schedule/);
    await expect(page.getByRole("button", { name: /Month/i })).toBeVisible();
  });
});
