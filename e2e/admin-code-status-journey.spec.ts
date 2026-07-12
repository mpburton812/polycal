import { expect, test, type Page } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin } from "./helpers/navigation";

/** Expands a collapsed admin accordion section by title. */
async function expandAdminSection(page: Page, title: string): Promise<void> {
  await page.getByRole("heading", { name: title, level: 2 }).click();
}

test.describe("Admin Code Status journey", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "Code Status");
  });

  test("shows build info and the latest change control entry", async ({ page }) => {
    await expect(page.getByText("Build number", { exact: true })).toBeVisible();
    await expect(page.getByTestId("code-status-build-number")).toBeVisible();
    await expect(
      page.getByText("Made live in this environment", { exact: true }),
    ).toBeVisible();

    // The most recent change control entry is shown inline in the panel.
    await expect(
      page.getByText("Latest change control entry", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("2026.07.12b").first()).toBeVisible();
  });

  test("build number opens the full change control log", async ({ page }) => {
    await page.getByTestId("code-status-build-number").click();

    const dialog = page.getByRole("dialog", { name: "Change control log" });
    await expect(dialog).toBeVisible();
    // Full log lists multiple promoted versions.
    await expect(dialog.getByText("2026.07.12b").first()).toBeVisible();
    await expect(dialog.getByText("2026.07.11c").first()).toBeVisible();
    await expect(dialog.getByText("2026.07.11b").first()).toBeVisible();
    await expect(dialog.getByText("2026.07.10").first()).toBeVisible();
    await expect(dialog.getByText("2026.07.09").first()).toBeVisible();
    await expect(dialog.getByText("2026.07.08").first()).toBeVisible();
    await expect(dialog.getByText("2026.07.03").first()).toBeVisible();

    await dialog.getByRole("button", { name: "Close change control log" }).click();
    await expect(dialog).toBeHidden();
  });

  test("Check for Update reports the current version when up to date", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Check for Update" }).click();
    await expect(
      page.getByText("You're on the latest version for this environment."),
    ).toBeVisible();
  });
});
