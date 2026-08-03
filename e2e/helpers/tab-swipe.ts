import { type Page, expect } from "@playwright/test";

import { dismissBlockingDialogsIfOpen } from "./motd";
import { MAIN_TAB_HREFS } from "../../src/components/layout/mainTabs";

export type MainTabPath = (typeof MAIN_TAB_HREFS)[number];

/** Bottom-nav label for a main tab href. */
export function mainTabLabel(href: MainTabPath): string {
  switch (href) {
    case "/feed":
      return "Feed";
    case "/schedule":
      return "Schedule";
    case "/proposals":
      return "Proposals";
    case "/people-places":
      return "People & Places";
    default:
      return href;
  }
}

/** Asserts URL + active carousel panel for a main tab (PC-407). */
export async function expectMainTab(page: Page, href: MainTabPath): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`${href.replace("/", "\\/")}`), {
    timeout: 15_000,
  });
  const panel = page.getByTestId(`main-tab-panel-${href.slice(1)}`);
  await expect(panel).toHaveAttribute("data-active", "true", { timeout: 15_000 });
}

/**
 * Swipes the main-tab carousel left (next) or right (previous).
 * Uses pointer events on the carousel viewport (PC-408).
 */
export async function swipeMainTab(
  page: Page,
  direction: "left" | "right",
): Promise<void> {
  await dismissBlockingDialogsIfOpen(page);
  const carousel = page.getByTestId("main-tab-carousel");
  await expect(carousel).toBeVisible({ timeout: 15_000 });
  const box = await carousel.boundingBox();
  if (!box) throw new Error("main-tab-carousel has no bounding box");

  const y = box.y + box.height * 0.35;
  const fromX = direction === "left" ? box.x + box.width * 0.8 : box.x + box.width * 0.2;
  const toX = direction === "left" ? box.x + box.width * 0.2 : box.x + box.width * 0.8;

  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 12 });
  await page.mouse.up();
}

/** Taps a bottom-nav main tab. */
export async function tapMainTab(page: Page, href: MainTabPath): Promise<void> {
  await dismissBlockingDialogsIfOpen(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("button", { name: mainTabLabel(href) }).click();
  await expectMainTab(page, href);
}
