import { expect, test } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed } from "./helpers/navigation";

test.describe("Feed tab", () => {
  test("unified feed with bottom composer and chat reply", async ({ page }) => {
    test.setTimeout(120_000);

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await goToFeed(page);

    await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible();
    await expect(page.getByLabel("Message the network")).toBeVisible();

    const stamp = `feed-chat-${Date.now()}`;
    const composer = page.getByLabel("Message the network");
    await composer.fill(stamp);
    await expect(page.getByTestId("feed-send")).toBeEnabled();
    await page.getByTestId("feed-send").click();
    // Enter posts when click is swallowed by overlays (PC-231).
    if ((await composer.inputValue()) === stamp) {
      await composer.focus();
      await composer.press("Enter");
    }

    const card = page.getByTestId("feed-chat-card").first();
    const errorAlert = page.locator('[role="alert"]').filter({ hasNotText: "" });

    try {
      await card.waitFor({ state: "visible", timeout: 30_000 });
    } catch {
      const alertText = (await errorAlert.allInnerTexts()).join(" | ");
      throw new Error(
        `Chat card not visible after send. alert=[${alertText}] console=[${consoleErrors.join(" | ")}]`,
      );
    }

    await expect(page.getByLabel("Message the network")).toHaveValue("");
    await expect(card.getByText(stamp)).toBeVisible();

    const reply = `feed-reply-${Date.now()}`;
    await page.getByPlaceholder("Reply…").first().fill(reply);
    await page.getByRole("button", { name: "Reply" }).first().click();
    await expect(page.getByText(reply)).toBeVisible({ timeout: 30_000 });
  });
});
