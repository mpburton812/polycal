import { type Locator, type Page, expect } from "@playwright/test";

import { dismissBlockingDialogsIfOpen } from "./motd";
import { expectMainTab, type MainTabPath } from "./tab-swipe";

/**
 * Clicks a bottom-nav link; falls back to direct navigation when the click is
 * blocked or does not change the URL (dev overlay / dialogs / slow transitions).
 */
async function clickBottomNavLink(page: Page, name: string, path: string): Promise<void> {
  await dismissBlockingDialogsIfOpen(page);
  const link = page.getByRole("link", { name });
  try {
    await link.click({ timeout: 8_000 });
  } catch {
    await page.goto(path);
  }
  try {
    await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}`), {
      timeout: 5_000,
    });
  } catch {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}`));
  }
}

/** Bottom-nav hop that also waits for the keep-alive panel to become active (PC-407). */
async function goToMainTab(page: Page, name: string, path: MainTabPath): Promise<void> {
  await clickBottomNavLink(page, name, path);
  await expectMainTab(page, path);
}

export async function goToFeed(page: Page): Promise<void> {
  await goToMainTab(page, "Feed", "/feed");
}

export async function goToSchedule(page: Page): Promise<void> {
  await goToMainTab(page, "Schedule", "/schedule");
}

export async function goToProposals(page: Page): Promise<void> {
  await goToMainTab(page, "Proposals", "/proposals");
}

export async function goToPeoplePlaces(page: Page): Promise<void> {
  await goToMainTab(page, "People & Places", "/people-places");
}

export async function goToAdmin(page: Page): Promise<void> {
  await openProfileMenu(page);
  const item = page.getByRole("menuitem", { name: "Admin", exact: true });
  try {
    await item.click({ timeout: 8_000 });
  } catch {
    await page.goto("/admin");
  }
  try {
    await expect(page).toHaveURL(/\/admin/, { timeout: 5_000 });
  } catch {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);
  }
}

/** Opens the header profile menu (avatar button). */
export async function openProfileMenu(page: Page): Promise<void> {
  await dismissBlockingDialogsIfOpen(page);
  await page.getByRole("button", { name: /Profile menu for/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** Navigates to profile settings via the header profile menu. */
export async function goToProfile(page: Page): Promise<void> {
  await openProfileMenu(page);
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/profile/);
}

export async function selectProposalTab(page: Page, tab: "Drafts" | "Proposed" | "Resolved" | "Archived"): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
}

/**
 * Waits until proposal detail finished loading (Close visible) after open (PC-138).
 * Close is deferred while the initial fetch is in flight.
 */
export async function waitForProposalDetailReady(dialog: Locator): Promise<void> {
  const loading = dialog.getByLabel("Loading proposal");
  await loading.waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible({
    timeout: 20_000,
  });
}

export async function openProposalCard(page: Page, title: string | RegExp): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await waitForProposalDetailReady(dialog);
}
