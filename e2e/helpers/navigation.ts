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

export async function selectProposalTab(page: Page, tab: "Drafts" | "Proposed" | "Resolved" | "Archived"): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
}

export async function openProposalCard(page: Page, title: string): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
