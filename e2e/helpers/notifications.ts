import { type Page, expect } from "@playwright/test";

import { waitForProposalDetailReady } from "./navigation";

/** Opens the header notification bell and waits for the inbox popover. */
export async function openNotificationInbox(page: Page): Promise<void> {
  await page.getByRole("button", { name: /notifications/i }).click();
  const panel = page.getByTestId("notifications-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  // Scope + exact: changelog copy can contain the substring "notifications" (PC-261).
  await expect(panel.getByText("Notifications", { exact: true })).toBeVisible();
}

/** Inbox panel root (popover content). */
export function notificationsPanel(page: Page) {
  return page.getByTestId("notifications-panel");
}

/** Inbox row for a given message fragment (title appears in the notification text). */
export function inboxRow(page: Page, message: string | RegExp) {
  return notificationsPanel(page).locator("li").filter({ hasText: message });
}

/** Clicks Accept on an inbox row that contains the given message text. */
export async function acceptFromInbox(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  const row = inboxRow(page, message);
  await row.getByRole("button", { name: "Accept" }).click();
}

/**
 * Opens a proposal from an inbox row via "Open Proposal".
 * Multi-slot polls cannot use Accept from the inbox (per-slot voting required).
 * Retries with reload — SSR notification props can lag right after login (PC-325).
 */
export async function openProposalFromInbox(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  await expect(async () => {
    await page.reload();
    await openNotificationInbox(page);
    const row = inboxRow(page, message);
    await expect(row).toBeVisible({ timeout: 8_000 });
    await row.getByRole("button", { name: "Open Proposal" }).click();
  }).toPass({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await waitForProposalDetailReady(dialog);
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
 * Closes the inbox popover without relying on the Close IconButton remaining stable
 * across reconcile/RSC remounts (PC-357).
 */
export async function closeNotificationInbox(page: Page): Promise<void> {
  const panel = notificationsPanel(page);
  if (!(await panel.isVisible().catch(() => false))) {
    return;
  }
  await page.keyboard.press("Escape");
  await expect(panel)
    .toBeHidden({ timeout: 5_000 })
    .catch(async () => {
      const close = page.getByRole("button", { name: "Close notifications" });
      if (await close.isVisible().catch(() => false)) {
        await close.click({ force: true, timeout: 3_000 });
      }
    });
}

/**
 * Reloads the shell (SSR notification props) and asserts a message appears in the inbox.
 * Retries with reload — Suspense can briefly mount an empty notification shell (PC-357).
 */
export async function expectInAppNotification(
  page: Page,
  message: string | RegExp,
): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: /notifications/i })).toBeVisible({
      timeout: 15_000,
    });
    await openNotificationInbox(page);
    await expect(notificationsPanel(page).getByText(message).first()).toBeVisible({
      timeout: 8_000,
    });
  }).toPass({ timeout: 60_000 });
  await closeNotificationInbox(page);
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
  await closeNotificationInbox(page);
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
