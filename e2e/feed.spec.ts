import { expect, test } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { expandAdminSection } from "./helpers/admin";
import { goToAdmin, goToFeed } from "./helpers/navigation";

test.describe("Feed tab", () => {
  test("shows milestones and chat sections", async ({ page }) => {
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

  test("admin can set sleeping proposals network visibility", async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "Poly group settings");
    await expect(
      page.getByRole("combobox", { name: /Sleeping proposals network visibility/i }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
