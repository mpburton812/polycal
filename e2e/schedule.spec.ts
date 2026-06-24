import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToSchedule } from "./helpers/navigation";

test.describe("Schedule calendar", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToSchedule(page);
  });

  test("shows weekly schedule view with legend", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
    await expect(page.getByText(/Approved events/i)).toBeVisible();
    await expect(page.getByLabel("Previous period")).toBeVisible();
    await expect(page.getByLabel("Next period")).toBeVisible();
  });

  test("shows resolved and proposed seed events for invitee", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Yavin 4 victory celebration/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Rescue Han from carbonite/i })).toBeVisible();
  });

  test("opens proposal detail from calendar block", async ({ page }) => {
    await page.getByRole("button", { name: /Yavin 4 victory celebration/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Yavin 4 victory celebration" })).toBeVisible();
  });

  test("planning mode lists accessible proposals", async ({ page }) => {
    await page.getByRole("button", { name: /Planning/i }).click();
    const drawer = page.locator(".MuiDrawer-paper");
    await expect(drawer.getByText("Planning mode")).toBeVisible();
    await expect(drawer.getByText("Rescue Han from carbonite")).toBeVisible();
  });

  test("switches to compact two-week view", async ({ page }) => {
    await page.getByRole("button", { name: "2 weeks" }).click();
    await expect(page.getByRole("button", { name: "2 weeks" })).toHaveAttribute("aria-pressed", "true");
  });
});
