import { expect, test } from "./helpers/test";

import { expandAdminSection } from "./helpers/admin";
import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin } from "./helpers/navigation";

test.describe("Impersonation journey", () => {
  test("admin test-data and user-management switch identity; admin path logs impersonation", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // —— Phase 1: Admin → Test data impersonation (distinct from DevBar env banner) ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "Test data");
    const adminImpersonate = page.locator('[aria-labelledby="admin-impersonate-label"]');
    await expect(adminImpersonate).toBeVisible();

    await adminImpersonate.click();
    await page
      .getByRole("option", { name: new RegExp(`${USERS.leia.displayName}.*${USERS.leia.username}`, "i") })
      .click();

    await page.waitForURL(/\/(feed|schedule)/, { timeout: 60_000 });
    await expect(
      page.getByRole("button", { name: new RegExp(`Profile menu for ${USERS.leia.displayName}`, "i") }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

    await logout(page);
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "User management");
    await page
      .getByRole("button", { name: `Impersonate ${USERS.han.displayName}` })
      .click();

    await page.waitForURL(/\/(feed|schedule)/, { timeout: 60_000 });
    await expect(
      page.getByRole("button", { name: new RegExp(`Profile menu for ${USERS.han.displayName}`, "i") }),
    ).toBeVisible({ timeout: 15_000 });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "System administrator log");

    const logTable = page.getByRole("table");
    await expect(logTable.getByText("Impersonation")).toBeVisible({ timeout: 15_000 });
    await expect(logTable.getByText(`Target: ${USERS.han.displayName}`)).toBeVisible();
  });
});
