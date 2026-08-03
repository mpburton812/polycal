import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { dismissBlockingDialogsIfOpen } from "./helpers/motd";
import {
  expectMainTab,
  swipeMainTab,
  tapMainTab,
} from "./helpers/tab-swipe";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

/**
 * Keep-alive main-tab carousel journeys (PC-407 / PC-408).
 */
test.describe("Tab swipe keepalive journey", () => {
  test("full strip traversal via swipe and reverse", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await tapMainTab(page, "/feed");

    await swipeMainTab(page, "left");
    await expectMainTab(page, "/schedule");
    await swipeMainTab(page, "left");
    await expectMainTab(page, "/proposals");
    await swipeMainTab(page, "left");
    await expectMainTab(page, "/people-places");

    await swipeMainTab(page, "right");
    await expectMainTab(page, "/proposals");
    await swipeMainTab(page, "right");
    await expectMainTab(page, "/schedule");
    await swipeMainTab(page, "right");
    await expectMainTab(page, "/feed");
  });

  test("bottom nav + swipe mix keeps carousel consistent", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);

    await tapMainTab(page, "/schedule");
    await swipeMainTab(page, "left");
    await expectMainTab(page, "/proposals");
    await tapMainTab(page, "/feed");
    await expectMainTab(page, "/feed");
  });

  test("schedule scroll position preserved after swipe away and back", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await tapMainTab(page, "/schedule");

    const panel = page.getByTestId("main-tab-panel-schedule");
    await panel.evaluate((el) => {
      el.scrollTop = 240;
    });
    const before = await panel.evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThanOrEqual(200);

    await swipeMainTab(page, "left");
    await expectMainTab(page, "/proposals");
    await swipeMainTab(page, "right");
    await expectMainTab(page, "/schedule");

    const after = await panel.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(40);
  });

  test("proposals sub-tab preserved after swipe away and back", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await expect(page.getByRole("tab", { name: /Resolved/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await swipeMainTab(page, "left");
    await expectMainTab(page, "/people-places");
    await swipeMainTab(page, "right");
    await expectMainTab(page, "/proposals");
    await expect(page.getByRole("tab", { name: /Resolved/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("people places Places sub-tab preserved after swipe", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await tapMainTab(page, "/people-places");
    await page.getByRole("tab", { name: /^Places$/i }).click();
    await expect(page.getByRole("tab", { name: /^Places$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await swipeMainTab(page, "right");
    await expectMainTab(page, "/proposals");
    await swipeMainTab(page, "left");
    await expectMainTab(page, "/people-places");
    await expect(page.getByRole("tab", { name: /^Places$/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("feed scroll preserved after swipe away and back", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await tapMainTab(page, "/feed");

    const panel = page.getByTestId("main-tab-panel-feed");
    await panel.evaluate((el) => {
      el.scrollTop = 180;
      // Also scroll window if the panel itself does not scroll.
      window.scrollTo(0, 180);
    });

    await swipeMainTab(page, "left");
    await expectMainTab(page, "/schedule");
    await swipeMainTab(page, "right");
    await expectMainTab(page, "/feed");

    const after = await panel.evaluate((el) => el.scrollTop || window.scrollY);
    expect(after).toBeGreaterThanOrEqual(80);
  });

  test("open proposal dialog blocks swipe tab change", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");

    const card = page.locator(".MuiCard-root").filter({
      has: page.getByRole("heading", { level: 2 }),
    }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    await swipeMainTab(page, "left");
    await expect(page).toHaveURL(/\/proposals/);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  });

  test("partial short drag does not change tabs", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, USERS.luke.username);
    await dismissBlockingDialogsIfOpen(page);
    await tapMainTab(page, "/schedule");

    const carousel = page.getByTestId("main-tab-carousel");
    const box = await carousel.boundingBox();
    if (!box) throw new Error("no carousel box");
    const y = box.y + box.height * 0.35;
    await page.mouse.move(box.x + box.width * 0.6, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.55, y, { steps: 4 });
    await page.mouse.up();
    await expectMainTab(page, "/schedule");
  });
});
