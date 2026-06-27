import { type Page, expect } from "@playwright/test";

/** Expands a place accordion on the Places tab. */
export async function expandPlace(page: Page, placeName: string): Promise<void> {
  await page.getByRole("tab", { name: "Places" }).click();
  await page.getByRole("heading", { name: placeName, level: 2 }).click();
  await expect(
    page.getByRole("button", { name: /Associate|Edit place|Delete place/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Admin associates a user with a place via the Add resident dropdown (PC-56 E2E).
 */
export async function associateResident(
  page: Page,
  placeName: string,
  residentDisplayName: string,
): Promise<void> {
  await expandPlace(page, placeName);
  const placePanel = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: placeName, level: 2 }) })
    .filter({ has: page.getByRole("button", { name: "Associate" }) })
    .last();
  await placePanel.getByLabel("Add resident").click();
  await page.getByRole("option", { name: residentDisplayName }).click();
  await placePanel.getByRole("button", { name: "Associate" }).click();
}
