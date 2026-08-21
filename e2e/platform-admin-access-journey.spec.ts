import { expect, test } from "./helpers/test";

import { expandAdminSection } from "./helpers/admin";
import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { dismissBlockingDialogsIfOpen } from "./helpers/motd";
import { openProfileMenu } from "./helpers/navigation";

/**
 * Platform admin access-level management (PC-368 / PC-369 / PC-370).
 */
test.describe("Platform admin access levels", () => {
  test("All Users shows avatar + access level; elevate from platform and admin UIs", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await login(page, USERS.luke.username);

    await openProfileMenu(page);
    await page.getByRole("menuitem", { name: "Platform admin" }).click();
    try {
      await expect(page).toHaveURL(/\/platform-admin/, { timeout: 15_000 });
    } catch {
      await page.goto("/platform-admin");
      await expect(page).toHaveURL(/\/platform-admin/);
    }
    await expect(page.getByRole("heading", { name: /All users/i })).toBeVisible({
      timeout: 30_000,
    });

    const leiaCard = page.getByTestId(`platform-user-${USERS.leia.username}`);
    await expect(leiaCard).toBeVisible({ timeout: 20_000 });
    await expect(leiaCard.getByRole("img", { name: /Leia Organa avatar/i })).toBeVisible();
    await expect(page.getByTestId(`platform-user-access-${USERS.leia.username}`)).toHaveText(
      /User|Admin/i,
    );

    await leiaCard.getByLabel(`Access level for ${USERS.leia.displayName}`).click();
    await page.getByRole("option", { name: "Platform Admin" }).click();
    await expect(page.getByTestId(`platform-user-access-${USERS.leia.username}`)).toHaveText(
      "Platform Admin",
      { timeout: 20_000 },
    );

    // Demote back so Admin user-management elevate can re-grant.
    await leiaCard.getByLabel(`Access level for ${USERS.leia.displayName}`).click();
    await page.getByRole("option", { name: "User", exact: true }).click();
    await expect(page.getByTestId(`platform-user-access-${USERS.leia.username}`)).toHaveText(
      "User",
      { timeout: 20_000 },
    );

    await page.goto("/admin");
    await dismissBlockingDialogsIfOpen(page);
    await expandAdminSection(page, "User management");
    const leiaRow = page.getByRole("row").filter({ hasText: USERS.leia.displayName });
    await expect(leiaRow.getByText("User", { exact: true })).toBeVisible({ timeout: 15_000 });
    await leiaRow.getByRole("button", { name: `Edit ${USERS.leia.displayName}` }).click();

    const editDialog = page.getByRole("dialog", { name: "Edit user" });
    await expect(editDialog).toBeVisible();
    await expect(editDialog.getByTestId("edit-user-access-level")).toBeVisible({ timeout: 10_000 });
    await editDialog.getByTestId("edit-user-access-level").click();
    await page.getByRole("option", { name: "Platform Admin" }).click();
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).toBeHidden({ timeout: 20_000 });
    await expect(leiaRow.getByText("Platform Admin", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
  });
});
