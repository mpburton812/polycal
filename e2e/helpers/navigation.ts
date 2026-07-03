import { type Page, expect } from "@playwright/test";

/**
 * Clicks a bottom-nav link and waits for route change.
 * Retries because client navigation can lag under parallel E2E load.
 */
async function goToMainNavLink(
  page: Page,
  linkName: string,
  urlPattern: RegExp,
): Promise<void> {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toBeVisible();

  await expect(async () => {
    await nav.getByRole("link", { name: linkName }).click();
    await expect(page).toHaveURL(urlPattern);
  }).toPass({ timeout: 20_000 });
}

export async function goToSchedule(page: Page): Promise<void> {
  await goToMainNavLink(page, "Schedule", /\/schedule/);
}

export async function goToProposals(page: Page): Promise<void> {
  await goToMainNavLink(page, "Proposals", /\/proposals/);
}

export async function goToPeoplePlaces(page: Page): Promise<void> {
  await goToMainNavLink(page, "People & Places", /\/people-places/);
}

export async function goToAdmin(page: Page): Promise<void> {
  await goToMainNavLink(page, "Admin", /\/admin/);
}

/** Opens the header profile menu (avatar button). */
export async function openProfileMenu(page: Page): Promise<void> {
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

export async function openProposalCard(page: Page, title: string | RegExp): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
