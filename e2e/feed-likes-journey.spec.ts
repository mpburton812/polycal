import { expect, test } from "./helpers/test";
import type { Page } from "@playwright/test";

import { login, expectAuthenticatedShell, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed } from "./helpers/navigation";

/** Visible composer textarea — MUI multiline also mounts a hidden sizer (PC-239). */
function feedComposer(page: Page) {
  return page.getByTestId("feed-composer").getByRole("textbox", { name: "Message the network" });
}

test.describe("Feed likes journey", () => {
  test("luke likes chat, leia sees count and likers popup", async ({ page }) => {
    test.setTimeout(180_000);

    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await goToFeed(page);

    const stamp = `like-chat-${Date.now()}`;
    const composer = feedComposer(page);
    await composer.click();
    await composer.fill(stamp);
    await expect(page.getByTestId("feed-send")).toBeEnabled();
    await page.getByTestId("feed-send").click();
    await expect(composer).toHaveValue("", { timeout: 30_000 });

    const card = page.getByTestId("feed-chat-card").filter({ hasText: stamp }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    await card.getByRole("button", { name: "Like", exact: true }).click();
    await expect(card.getByRole("button", { name: "Unlike", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(card.getByRole("button", { name: /1 likes/ })).toBeVisible();

    await logout(page);
    await login(page, USERS.leia.username);
    await goToFeed(page);

    const leiaCard = page.getByTestId("feed-chat-card").filter({ hasText: stamp }).first();
    await expect(leiaCard).toBeVisible({ timeout: 30_000 });
    await expect(leiaCard.getByRole("button", { name: /1 likes/ })).toBeVisible();
    await leiaCard.getByRole("button", { name: /1 likes/ }).click();
    await expect(page.getByRole("heading", { name: "Liked by" })).toBeVisible();
    await expect(page.getByText(USERS.luke.displayName)).toBeVisible();
  });
});
