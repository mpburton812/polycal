import { expect, test } from "./helpers/test";

import { login, signOutViaMenu } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { completeFirstLoginOnboarding } from "./helpers/onboarding";
import { goToPeoplePlaces } from "./helpers/navigation";
import { parseLoginInstructions } from "./helpers/provisioning";

test.describe("Admin user provisioning", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  });

  test("admin creates user, copies credentials, signs out, and new user completes onboarding", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const username = `e2euser${Date.now()}`;
    const displayName = `E2E Provisioned ${Date.now()}`;
    const permanentPassword = "E2eNewPass1!";

    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);

    await page.getByRole("button", { name: "Add person" }).click();
    const dialog = page.getByRole("dialog", { name: "Add person" });

    await dialog.getByLabel("Username").fill(username);
    await dialog.getByLabel("Username").blur();
    await expect(dialog.getByText("Username is available")).toBeVisible({ timeout: 15_000 });

    await dialog.getByLabel("Display name").fill(displayName);
    await dialog.getByLabel("Role").click();
    await page.getByRole("option", { name: "User" }).click();

    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(dialog.getByText(/Created active user/i)).toBeVisible({ timeout: 15_000 });

    const instructionsField = dialog.locator("textarea").first();
    await expect(instructionsField).toBeVisible();
    const instructions = await instructionsField.inputValue();
    const credentials = parseLoginInstructions(instructions);
    expect(credentials.username).toBe(username.toLowerCase());

    await dialog.getByRole("button", { name: "Copy instructions" }).click();
    await expect(dialog.getByText("Login instructions copied to clipboard.")).toBeVisible();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toContain(`Username: ${credentials.username}`);
    expect(clipboardText).toContain(`Temporary password: ${credentials.temporaryPassword}`);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(displayName)).toBeVisible();

    await signOutViaMenu(page);

    await login(page, credentials.username, credentials.temporaryPassword);
    await completeFirstLoginOnboarding(page, permanentPassword);

    await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
    await goToPeoplePlaces(page);
    await expect(page.getByText(displayName)).toBeVisible();
  });
});
