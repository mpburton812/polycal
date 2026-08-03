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

/**
 * Active keep-alive panel — scopes locators so hidden sibling tabs cannot
 * match (Playwright still finds `display:none` nodes in strict mode).
 */
export function activeMainPanel(page: Page) {
  return page.locator('[data-testid^="main-tab-panel-"][data-active="true"]');
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
 * Dispatches pointer events on the carousel root so interactive children
 * inside the panel cannot set the ignore flag (PC-408).
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

  const y = box.y + box.height * 0.2;
  const fromX = direction === "left" ? box.x + box.width * 0.85 : box.x + box.width * 0.15;
  const toX = direction === "left" ? box.x + box.width * 0.15 : box.x + box.width * 0.85;

  await carousel.dispatchEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    clientX: fromX,
    clientY: y,
    pointerType: "touch",
    pointerId: 1,
    buttons: 1,
  });
  await carousel.dispatchEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    clientX: toX,
    clientY: y,
    pointerType: "touch",
    pointerId: 1,
    buttons: 0,
  });
}

/** Taps a bottom-nav main tab (AppTabs use Next.js Link → role=link). */
export async function tapMainTab(page: Page, href: MainTabPath): Promise<void> {
  await dismissBlockingDialogsIfOpen(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const link = nav.getByRole("link", { name: mainTabLabel(href) });
  try {
    await link.click({ timeout: 8_000 });
  } catch {
    await page.goto(href);
  }
  await expectMainTab(page, href);
}
