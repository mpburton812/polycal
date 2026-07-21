import { expect, test } from "./helpers/test";
import type { Page } from "@playwright/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed } from "./helpers/navigation";

/** Visible composer textarea — MUI multiline also mounts a hidden sizer (PC-239). */
function feedComposer(page: Page) {
  return page.getByTestId("feed-composer").getByRole("textbox", { name: "Message the network" });
}

/** Posts a network chat message via bottom composer (PC-231/PC-239). */
async function postFeedChat(page: Page, stamp: string) {
  const composer = feedComposer(page);
  await composer.click();
  await composer.fill(stamp);
  await expect(page.getByTestId("feed-send")).toBeEnabled();
  await page.getByTestId("feed-send").click();
  await expect(composer).toHaveValue("", { timeout: 30_000 });
}

test.describe("Feed tab", () => {
  test("unified feed with bottom composer and chat reply", async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await goToFeed(page);

    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
    await expect(feedComposer(page)).toBeVisible();

    const stamp = `feed-chat-${Date.now()}`;
    await postFeedChat(page, stamp);

    const card = page.getByTestId("feed-chat-card").filter({ hasText: stamp }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    await card.getByRole("button", { name: "Like", exact: true }).click();
    await expect(card.getByRole("button", { name: "Unlike", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card.getByRole("button", { name: /1 likes/ })).toBeVisible();
    await card.getByRole("button", { name: "Unlike", exact: true }).click();
    await expect(card.getByRole("button", { name: "Like", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card.getByRole("button", { name: /0 likes/ })).toBeVisible();

    const reply = `feed-reply-${Date.now()}`;
    await page.getByPlaceholder("Reply…").first().fill(reply);
    await page.getByRole("button", { name: "Reply" }).first().click();
    await expect(page.getByText(reply)).toBeVisible({ timeout: 30_000 });
  });

  test("posts a URL and shows a Facebook-style link preview card", async ({ page }) => {
    test.setTimeout(120_000);

    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await goToFeed(page);

    const stamp = `feed-link-${Date.now()}`;
    const url = "https://demo.link-preview.test/article";
    const body = `${stamp} ${url}`;
    await postFeedChat(page, body);

    const card = page.getByTestId("feed-chat-card").filter({ hasText: stamp }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByTestId("feed-linkified-body").getByRole("link", { name: url })).toBeVisible();
    const preview = card.getByTestId("feed-link-preview");
    await expect(preview).toBeVisible({ timeout: 30_000 });
    await expect(preview.getByText("E2E Link Preview Title")).toBeVisible();
    await expect(preview).toHaveAttribute("href", url);
  });
});
