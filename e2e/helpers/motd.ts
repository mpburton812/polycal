import { type Page, expect } from "@playwright/test";

/**
 * Dismisses an MOTD pop-up if present so it cannot block clicks or remount the shell (PC-392).
 */
export async function dismissMotdDialogIfOpen(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: /^(Platform|Network) message$/ }),
  });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  }
}

/**
 * Dismisses Google Calendar sync failure dialog (PC-398). CI builds may not
 * inline NEXT_PUBLIC_E2E_TEST_MODE, so the host still mounts in Playwright.
 */
export async function dismissCalendarSyncDialogIfOpen(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /Google Calendar sync failed/i });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "Dismiss" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  }
}

/** Dismisses known shell-blocking dialogs before interacting with the app. */
export async function dismissBlockingDialogsIfOpen(page: Page): Promise<void> {
  await dismissMotdDialogIfOpen(page);
  await dismissCalendarSyncDialogIfOpen(page);
}
