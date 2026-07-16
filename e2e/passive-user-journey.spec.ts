import { expect, test } from "./helpers/test";

import { expandAdminSection } from "./helpers/admin";
import { login, signOutViaMenu } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { completeFirstLoginOnboarding } from "./helpers/onboarding";
import { goToAdmin, goToPeoplePlaces } from "./helpers/navigation";
import { parseLoginInstructions } from "./helpers/provisioning";

test.describe("Passive user journey", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("create passive profile, activate in admin, and complete first login", async ({ page }) => {
    test.setTimeout(180_000);
    const displayName = `E2E Passive ${Date.now()}`;
    const username = `e2epassive${Date.now()}`;
    const permanentPassword = "E2ePassive1!";

    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);

    await page.getByRole("button", { name: "Add person" }).click();
    const createDialog = page.getByRole("dialog", { name: "Add person" });
    await createDialog.getByRole("tab", { name: "Proxy profile" }).click();
    await createDialog.getByLabel("Display name").fill(displayName);
    await createDialog.getByRole("button", { name: "Create" }).click();
    await expect(createDialog.getByText(/Created proxy profile/i)).toBeVisible({
      timeout: 15_000,
    });
    await createDialog.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText(displayName)).toBeVisible();
    await expect(page.getByText("Proxy", { exact: true }).first()).toBeVisible();

    await goToAdmin(page);
    await expandAdminSection(page, "User management");
    await page.getByRole("button", { name: `Activate ${displayName}` }).click();

    const activateDialog = page.getByRole("dialog", { name: "Activate proxy user" });
    await activateDialog.getByLabel("Username").fill(username);
    await activateDialog.getByLabel("Username").blur();
    await expect(activateDialog.getByText("Username is available")).toBeVisible({
      timeout: 15_000,
    });
    await activateDialog.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText(/Activated .* as an active user/i)).toBeVisible({
      timeout: 15_000,
    });

    const credentialsBlock = page.locator(".MuiAlert-root").filter({ hasText: "Username:" });
    await expect(credentialsBlock).toBeVisible({ timeout: 15_000 });
    const instructions = (await credentialsBlock.textContent()) ?? "";
    const credentials = parseLoginInstructions(instructions);
    expect(credentials.username).toBe(username.toLowerCase());

    await page.getByRole("button", { name: "Copy instructions" }).click();
    await signOutViaMenu(page);

    await login(page, credentials.username, credentials.temporaryPassword);
    await completeFirstLoginOnboarding(page, permanentPassword);
    await expect(page).toHaveURL(/\/feed/);
  });
});
