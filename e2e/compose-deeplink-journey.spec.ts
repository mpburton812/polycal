import { expect, emptyStorageState, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { SEED_PASSWORD, USERS } from "./helpers/constants";
import { dismissBlockingDialogsIfOpen } from "./helpers/motd";
import { openComposerFromFeedQuery } from "./helpers/proposals";

/**
 * Widget / PWA compose deep-links on /feed (PC-454 / PC-455).
 */
test.describe("Compose deep-link journey", () => {
  test("opens New Event with title from /feed?compose=event", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, USERS.luke.username);
    const dialog = await openComposerFromFeedQuery(page, {
      compose: "event",
      title: "Widget Brunch",
    });
    await expect(dialog.getByLabel("Title")).toHaveValue("Widget Brunch");
    await expect(page).not.toHaveURL(/compose=/);
  });

  test("opens NLP composer with description from /feed?compose=nlp", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, USERS.luke.username);
    const dialog = await openComposerFromFeedQuery(page, {
      compose: "nlp",
      q: "Dinner Friday",
    });
    await expect(dialog.getByLabel("Description")).toHaveValue("Dinner Friday");
    await expect(page).not.toHaveURL(/compose=/);
  });

  test("opens an empty New Event composer when title is omitted", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, USERS.luke.username);
    const dialog = await openComposerFromFeedQuery(page, { compose: "event" });
    await expect(dialog.getByLabel("Title")).toHaveValue("");
  });
});

test.describe("Compose login resume", () => {
  test.use({ storageState: emptyStorageState });

  test("returns to the compose URL after login", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/feed?compose=event&title=AfterLogin");
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/callbackUrl=/);
    await page.getByLabel("Username").fill(USERS.luke.username);
    await page.getByLabel("Password").fill(SEED_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/feed/, { timeout: 60_000 });
    await dismissBlockingDialogsIfOpen(page);
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "New Event", exact: true }),
    });
    await expect(dialog.getByRole("heading", { name: "New Event", exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByLabel("Title")).toHaveValue("AfterLogin");
  });
});
