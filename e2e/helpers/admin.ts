import { type Page, expect } from "@playwright/test";

import { dismissBlockingDialogsIfOpen } from "./motd";

/** Expands a collapsed admin accordion section by title. Idempotent — does not toggle closed. */
export async function expandAdminSection(page: Page, title: string): Promise<void> {
  await dismissBlockingDialogsIfOpen(page);
  const heading = page.getByRole("heading", { name: title, level: 2 });
  await expect(heading).toBeVisible({ timeout: 20_000 });
  const toggle = heading.locator("xpath=ancestor::*[@role='button'][1]");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await heading.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

function userRow(page: Page, displayName: string) {
  return page.getByRole("row").filter({ hasText: displayName });
}

/** Pauses a user from the admin user management table (reason dialog required, PC-362). */
export async function pauseUserInAdmin(page: Page, displayName: string): Promise<void> {
  await expandAdminSection(page, "User management");
  const pauseButton = userRow(page, displayName).getByRole("button", {
    name: `Pause ${displayName}`,
  });
  await expect(pauseButton).toBeVisible({ timeout: 15_000 });
  await pauseButton.click();

  // Pause opens ModerationDialog; confirm with a reason or the action is a no-op.
  const dialog = page.getByRole("dialog", { name: `Pause ${displayName}` });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByLabel("Reason").fill("E2E: pause for bad-user journey");
  await dialog.getByRole("button", { name: "Pause user" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

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
