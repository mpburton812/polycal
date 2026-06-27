import { type Page, expect } from "@playwright/test";

/** Opens the header notification bell and waits for the inbox popover. */
export async function openNotificationInbox(page: Page): Promise<void> {
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByText("Notifications").first()).toBeVisible();
}

/**
 * Reloads the shell (SSR notification props) and asserts a message appears in the inbox.
 */
export async function expectInAppNotification(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  await page.reload();
  await openNotificationInbox(page);
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 15_000 });
}

/** Asserts the notification badge shows an unread count. */
export async function expectNotificationBadge(page: Page, count: number): Promise<void> {
  await expect(
    page.getByRole("button", { name: new RegExp(`${count} notifications`, "i") }),
  ).toBeVisible({ timeout: 15_000 });
}
