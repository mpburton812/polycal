import { type Page, expect } from "@playwright/test";

/** Expands a place accordion on the Places tab. */
export async function expandPlace(page: Page, placeName: string): Promise<void> {
  await page.getByRole("tab", { name: "Places" }).click();
  await page.getByRole("heading", { name: placeName, level: 2 }).click();
  await expect(
    page.getByRole("button", { name: /Add|Edit place|Delete place/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Owner/admin adds a person to a place immediately with a role (PC-187).
 */
export async function addPersonToPlace(
  page: Page,
  placeName: string,
  personDisplayName: string,
  role: "Owner" | "Resident" = "Resident",
): Promise<void> {
  await expandPlace(page, placeName);
  const placePanel = page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: placeName, level: 2 }) })
    .filter({ has: page.getByRole("button", { name: "Add", exact: true }) })
    .last();
  await placePanel.getByLabel("Add person").click();
  await page.getByRole("option", { name: personDisplayName }).click();
  await placePanel.getByLabel("Role").click();
  await page.getByRole("option", { name: role, exact: true }).click();
  await placePanel.getByRole("button", { name: "Add", exact: true }).click();
}

/** @deprecated Use addPersonToPlace — kept for call-site clarity during migration. */
export async function associateResident(
  page: Page,
  placeName: string,
  residentDisplayName: string,
): Promise<void> {
  await addPersonToPlace(page, placeName, residentDisplayName, "Resident");
}
