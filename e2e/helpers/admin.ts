import { type Page, expect } from "@playwright/test";

/** Expands a collapsed admin accordion section by title. */
export async function expandAdminSection(page: Page, title: string): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).click();
}

function userRow(page: Page, displayName: string) {
  return page.getByRole("row").filter({ hasText: displayName });
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
