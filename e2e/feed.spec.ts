import { expect, test } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed } from "./helpers/navigation";

test.describe("Feed tab", () => {
  test("shows milestones and network chat", async ({ page }) => {
    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await goToFeed(page);

    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Milestones" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Chat" })).toBeVisible();

    await page.getByRole("tab", { name: "Chat" }).click();
    await expect(page.getByLabel("Message the network")).toBeVisible();
    const stamp = `feed-chat-${Date.now()}`;
    await page.getByLabel("Message the network").fill(stamp);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(stamp)).toBeVisible({ timeout: 15_000 });
  });
});
