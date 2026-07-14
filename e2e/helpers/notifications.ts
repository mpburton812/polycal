import { type Page, expect } from "@playwright/test";

/** Opens the header notification bell and waits for the inbox popover. */
export async function openNotificationInbox(page: Page): Promise<void> {
  await page.getByRole("button", { name: /notifications/i }).click();
  await expect(page.getByText("Notifications").first()).toBeVisible();
}

/** Inbox row for a given message fragment (title appears in the notification text). */
export function inboxRow(page: Page, message: string | RegExp) {
  return page.locator("li").filter({ hasText: message });
}

/** Clicks Accept on an inbox row that contains the given message text. */
export async function acceptFromInbox(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  const row = inboxRow(page, message);
  await row.getByRole("button", { name: "Accept" }).click();
}

/** Clicks Decline on an inbox vote row that contains the given message text. */
export async function declineFromInbox(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  const row = inboxRow(page, message);
  await row.getByRole("button", { name: "Decline" }).click();
}

/** Dismisses a single notification by message text. */
export async function dismissNotification(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  const row = inboxRow(page, message);
  await row.getByRole("button", { name: "Dismiss notification" }).click();
}

/** Clears every notification from the open inbox popover. */
export async function clearAllNotifications(page: Page): Promise<void> {
  const inboxOpen = await page.getByRole("button", { name: "Close notifications" }).isVisible();
  if (!inboxOpen) {
    await openNotificationInbox(page);
  }
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByTestId("notifications-empty")).toBeVisible({ timeout: 15_000 });
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
  await page.getByRole("button", { name: "Close notifications" }).click();
}

/**
 * Full reload then assert no Accept/Decline vote actions remain for `message` (PC-219).
 * Informational rows (e.g. proposal_resolved) may still mention the title.
 */
export async function expectActionableNotificationClearedAfterReload(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  await page.reload();
  await openNotificationInbox(page);
  const row = inboxRow(page, message);
  await expect(row.getByRole("button", { name: "Accept" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(row.getByRole("button", { name: "Decline" })).toHaveCount(0);
  // Review invite copy must be gone for this title (resolved copy may remain).
  await expect(row.filter({ hasText: /needs your review/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Close notifications" }).click();
}

/** Asserts the notification badge shows an unread count. */
export async function expectNotificationBadge(page: Page, count: number): Promise<void> {
  await expect(
    page.getByRole("button", { name: new RegExp(`${count} notifications`, "i") }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Asserts the header bell has no unread numeric badge (0 notifications aria-label). */
export async function expectNotificationBadgeCleared(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /^Notifications$/i })).toBeVisible({
    timeout: 15_000,
  });
}
