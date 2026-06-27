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
  await userRow(page, displayName).getByRole("button", { name: `Pause ${displayName}` }).click();
}

/** Resumes a paused user from the admin user management table. */
export async function resumeUserInAdmin(page: Page, displayName: string): Promise<void> {
  await expandAdminSection(page, "User management");
  await userRow(page, displayName).getByRole("button", { name: `Resume ${displayName}` }).click();
}

/** Deletes a user from the admin user management table. */
export async function deleteUserInAdmin(page: Page, displayName: string): Promise<void> {
  await expandAdminSection(page, "User management");
  await userRow(page, displayName).getByRole("button", { name: `Delete ${displayName}` }).click();
  const dialog = page.getByRole("dialog", { name: "Delete user?" });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}
