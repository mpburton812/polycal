import { type Page, expect } from "@playwright/test";

import { activeMainPanel } from "./tab-swipe";

/** Expands a place accordion on the Places tab. */
export async function expandPlace(page: Page, placeName: string): Promise<void> {
  const panel = activeMainPanel(page);
  await panel.getByRole("tab", { name: "Places" }).click();
  // exact: true so the section header (role=button) is not confused with the chevron.
  // Skip the heading click when already expanded — a second click collapses the row.
  const collapseButton = panel.getByRole("button", {
    name: `Collapse ${placeName}`,
    exact: true,
  });
  if (!(await collapseButton.isVisible())) {
    await panel.getByRole("heading", { name: placeName, level: 2 }).click();
  }
  await expect(
    panel.getByRole("button", { name: /Add|Edit place|Delete place/i }).first(),
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
  const panel = activeMainPanel(page);
  const placePanel = panel
    .locator("div")
    .filter({ has: panel.getByRole("heading", { name: placeName, level: 2 }) })
    .filter({ has: panel.getByRole("button", { name: "Add", exact: true }) })
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
