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
