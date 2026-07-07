import { expect, test } from "./helpers/test";

import { expandAdminSection } from "./helpers/admin";
import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin, goToSchedule } from "./helpers/navigation";

test.describe("Impersonation journey", () => {
  test("dev bar and admin panel switch identity; admin path logs impersonation", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await login(page, USERS.luke.username);
    await expect(page.getByLabel("Impersonate user")).toBeVisible();

    await page.getByLabel("Impersonate user").click();
    await page
      .getByRole("option", { name: new RegExp(`${USERS.leia.displayName}.*${USERS.leia.username}`, "i") })
      .click();

    await page.waitForURL(/\/schedule/, { timeout: 60_000 });
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

    await page.waitForURL(/\/schedule/, { timeout: 60_000 });
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
