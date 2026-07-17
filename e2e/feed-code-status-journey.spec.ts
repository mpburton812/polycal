import { expect, test, type Page } from "./helpers/test";

import { login, expectAuthenticatedShell } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToFeed } from "./helpers/navigation";
import { CHANGELOG } from "../src/lib/changelog/entries";

/** Expands a collapsed Code Status section by title (chevron header). */
async function expandCodeStatus(page: Page): Promise<void> {
  await page.getByRole("heading", { name: "Code Status", level: 2 }).click();
}

test.describe("Feed Code Status journey", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await expectAuthenticatedShell(page);
    await goToFeed(page);
  });

  test("Code Status starts collapsed and expands via chevron header", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Code Status", level: 2 })).toBeVisible();
    await expect(page.getByTestId("code-status-build-number")).toBeHidden();

    await expandCodeStatus(page);

    await expect(page.getByTestId("code-status-panel")).toBeVisible();
    await expect(page.getByTestId("code-status-build-number")).toBeVisible();
    await expect(page.getByText("Build number", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Made live in this environment", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Latest change control entry", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(CHANGELOG[0]!.version).first()).toBeVisible();
  });

  test("expanded build number opens the full change control log", async ({ page }) => {
    await expandCodeStatus(page);
    await page.getByTestId("code-status-build-number").click();

    const dialog = page.getByRole("dialog", { name: "Change control log" });
    await expect(dialog).toBeVisible();
    for (const entry of CHANGELOG.slice(0, 8)) {
      await expect(dialog.getByText(entry.version).first()).toBeVisible();
    }

    await dialog.getByRole("button", { name: "Close change control log" }).click();
    await expect(dialog).toBeHidden();
  });

  test("chevron collapses Code Status again", async ({ page }) => {
    await expandCodeStatus(page);
    await expect(page.getByTestId("code-status-build-number")).toBeVisible();

    await page.getByRole("button", { name: "Collapse Code Status" }).click();
    await expect(page.getByTestId("code-status-build-number")).toBeHidden();
  });
});
