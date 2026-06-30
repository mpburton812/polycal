import { type Page, expect } from "@playwright/test";

export async function goToSchedule(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Schedule" }).click();
  await expect(page).toHaveURL(/\/schedule/);
}

export async function goToProposals(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Proposals" }).click();
  await expect(page).toHaveURL(/\/proposals/);
}

export async function goToPeoplePlaces(page: Page): Promise<void> {
  await page.getByRole("link", { name: "People & Places" }).click();
  await expect(page).toHaveURL(/\/people-places/);
}

export async function goToAdmin(page: Page): Promise<void> {
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin/);
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
