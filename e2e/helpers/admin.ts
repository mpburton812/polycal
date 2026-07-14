import { type Page, expect } from "@playwright/test";

/** Expands a collapsed admin accordion section by title. */
export async function expandAdminSection(page: Page, title: string): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).click();
}

function userRow(page: Page, displayName: string) {
  return page.getByRole("row").filter({ hasText: displayName });
}

/** Locates the expanded Poly group settings accordion panel. */
function polyGroupSettingsPanel(page: Page) {
  return page.locator("div").filter({
    has: page.getByRole("heading", { name: "Poly group settings", level: 2 }),
  });
}

/** Selects a value from the Group name change mode MUI combobox. */
export async function selectGroupNameChangeMode(
  page: Page,
  modeLabel: string | RegExp,
): Promise<void> {
  const panel = polyGroupSettingsPanel(page);
  await panel.getByRole("combobox").first().click();
  await page.getByRole("option", { name: modeLabel }).click();
}

/** Enables group rename proposals and sets the change mode in admin settings. */
export async function configureGroupNameProposals(
  page: Page,
  options: { mode: string },
): Promise<void> {
  await expandAdminSection(page, "Poly group settings");
  const allowSwitch = page.getByRole("checkbox", {
    name: "Allow proposals to change group name",
  });
  if (!(await allowSwitch.isChecked())) {
    await page.getByText("Allow proposals to change group name").click();
  }
    await selectGroupNameChangeMode(page, options.mode);
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /saved|updated/i })).toBeVisible({
    timeout: 15_000,
  });
  // Ensure settings round-trip before drafting a rename (avoids silent propose failure).
  await expect(page.getByRole("button", { name: "Propose name change (draft)" })).toBeEnabled({
    timeout: 15_000,
  });
}

/** Pauses a user from the admin user management table. */
export async function pauseUserInAdmin(page: Page, displayName: string): Promise<void> {
  await expandAdminSection(page, "User management");
  const pauseButton = userRow(page, displayName).getByRole("button", {
    name: `Pause ${displayName}`,
  });
  await expect(pauseButton).toBeVisible({ timeout: 15_000 });
  await pauseButton.click();
  await expect(userRow(page, displayName).getByText("paused", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Resumes a paused user from the admin user management table. */
export async function resumeUserInAdmin(page: Page, displayName: string): Promise<void> {
  await expandAdminSection(page, "User management");
  const resumeButton = userRow(page, displayName).getByRole("button", {
    name: `Resume ${displayName}`,
  });
  await expect(resumeButton).toBeVisible({ timeout: 15_000 });
  await resumeButton.click();
  await expect(userRow(page, displayName).getByText("active", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
}

/** Deletes a user from the admin user management table. */
export async function deleteUserInAdmin(page: Page, displayName: string): Promise<void> {
  await expandAdminSection(page, "User management");
  await userRow(page, displayName).getByRole("button", { name: `Delete ${displayName}` }).click();
  const dialog = page.getByRole("dialog", { name: "Delete user?" });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}
