import { E2E_API_SECRET } from "./e2e-env";
import { login } from "./helpers/auth";
import { expandAdminSection } from "./helpers/admin";
import { USERS } from "./helpers/constants";
import { goToAdmin, openProfileMenu } from "./helpers/navigation";
import { emptyStorageState, expect, test } from "./helpers/test";
import { expectToast } from "./helpers/toast";

/**
 * Sponsor chip, autosave, DELETE confirmation, About, and email login (PC-460–PC-465).
 */
test.describe("sponsor platform ops journey", () => {
  test("shows Sponsor chip and refuses demote in user management", async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "User management");
    await expect(page.getByTestId("sponsor-chip").first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: `Delete ${USERS.luke.displayName}` }),
    ).toHaveCount(0);
  });

  test("autosaves Enable Feed without a Save settings button", async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "Network Configuration");
    await expect(page.getByRole("button", { name: /Save settings/i })).toHaveCount(0);
    const toggle = page.getByLabel("Enable Feed");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    const wasChecked = await toggle.isChecked();
    await toggle.click();
    await expectToast(page, /Network settings saved/i);
    await expect(toggle).toBeChecked({ checked: !wasChecked });
    await toggle.click();
    await expectToast(page, /Network settings saved/i);
  });

  test("requires DELETE confirmation in the danger zone", async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "Network Configuration");
    const confirm = page.getByLabel("Type DELETE to close this network");
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Close network" })).toBeDisabled();
    await confirm.fill("delete");
    await expect(page.getByRole("button", { name: "Close network" })).toBeDisabled();
    await confirm.fill("DELETE");
    await expect(page.getByRole("button", { name: "Close network" })).toBeEnabled();
  });

  test("About menu links to privacy and terms", async ({ page }) => {
    await login(page, USERS.luke.username);
    await openProfileMenu(page);
    await page.getByRole("menuitem", { name: "About" }).click();
    const dialog = page.getByRole("dialog", { name: "About PolyCal" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await expect(dialog.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});

test.describe("email login control", () => {
  test.use({ storageState: emptyStorageState });

  test("login page offers Email login and redeems a helper token", async ({
    page,
    request,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Email login" })).toBeVisible();

    const token = `el-e2e-${Date.now()}`;
    const seed = await request.post("/api/e2e/email-login-token", {
      headers: { "x-e2e-api-secret": E2E_API_SECRET },
      data: { username: USERS.luke.username, token },
    });
    expect(seed.ok()).toBeTruthy();

    await page.goto(`/login/email?token=${token}`);
    await expect(page).toHaveURL(/\/(feed|schedule)/, { timeout: 60_000 });
    await expect(page.getByRole("heading", { name: /change your password/i })).toHaveCount(0);
  });
});
