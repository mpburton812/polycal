import { expect, test, type Page } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed } from "./helpers/navigation";
import { CHANGELOG } from "../src/lib/changelog/entries";

/** Expands a collapsed accordion section by title. */
async function expandSection(page: Page, title: string): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).click();
}

test.describe("Feed Code Status journey", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToFeed(page);
  });

  test("starts collapsed and expands via chevron header", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Code Status", level: 2 })).toBeVisible();
    await expect(page.getByText("Build number", { exact: true })).toBeHidden();

    await expandSection(page, "Code Status");

    await expect(page.getByText("Build number", { exact: true })).toBeVisible();
    await expect(page.getByTestId("code-status-build-number")).toBeVisible();
    await expect(
      page.getByText("Latest change control entry", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(CHANGELOG[0]!.version).first()).toBeVisible();
  });

  test("build number opens the full change control log when expanded", async ({ page }) => {
    await expandSection(page, "Code Status");
    await page.getByTestId("code-status-build-number").click();

    const dialog = page.getByRole("dialog", { name: "Change control log" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(CHANGELOG[0]!.version).first()).toBeVisible();

    await dialog.getByRole("button", { name: "Close change control log" }).click();
    await expect(dialog).toBeHidden();
  });
});
