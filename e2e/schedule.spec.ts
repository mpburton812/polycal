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

    /** Proposed items always appear in planning mode; calendar week scan is only for tentative blocks. */
    await page.getByRole("button", { name: "Planning", exact: true }).click();
    const drawer = page.locator(".MuiDrawer-paper");
    await expect(drawer.getByText("Rescue Han from carbonite")).toBeVisible({ timeout: 15_000 });
  });

  test("opens proposal detail from calendar block", async ({ page }) => {
    await page.getByRole("button", { name: /Yavin 4 victory celebration/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Yavin 4 victory celebration" })).toBeVisible();
  });

  test("planning mode lists accessible proposals", async ({ page }) => {
    await page.getByRole("button", { name: "Planning", exact: true }).click();
    const drawer = page.locator(".MuiDrawer-paper");
    await expect(drawer.getByText("Planning mode")).toBeVisible();
    await expect(drawer.getByText("Jedi Council briefing")).toBeVisible({ timeout: 20_000 });
  });

  test("opens on the current week by default", async ({ page }) => {
    const monday = new Date();
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const expectedStart = monday.toLocaleDateString(undefined, fmt);
    await expect(page.getByText(new RegExp(expectedStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeVisible();
  });

  test("shows at-risk legend label", async ({ page }) => {
    await expect(page.getByText(/At risk \/ tentative/i)).toBeVisible();
  });

  test("switches to month view and drills into week from overflow", async ({ page }) => {
    await page.getByRole("button", { name: "Month" }).click();
    await expect(page.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Mon", { exact: true })).toBeVisible();

    const moreLink = page.getByRole("button", { name: /\+\d+ more/i }).first();
    if (await moreLink.isVisible().catch(() => false)) {
      await moreLink.click();
      await expect(page.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("shows archived legend label", async ({ page }) => {
    await expect(page.getByText(/Archived/i)).toBeVisible();
  });
});
