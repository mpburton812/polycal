import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToSchedule } from "./helpers/navigation";

test.describe("Schedule calendar", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToSchedule(page);
  });

  test("shows weekly schedule view with period controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
    await expect(page.getByLabel("Previous period")).toBeVisible();
    await expect(page.getByLabel("Next period")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jump to today" })).toBeVisible();
    await expect(page.getByLabel("Calendar period").getByRole("button", { name: "Day", exact: true })).toBeVisible();
    await expect(page.getByLabel("Calendar period").getByRole("button", { name: "Week", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("view options has network filter without status legend", async ({ page }) => {
    await page.getByLabel("View options").click();
    const drawer = page.locator(".MuiDrawer-paper");
    await expect(drawer.getByLabel("Network filter")).toBeVisible();
    await expect(drawer.getByText(/Approved events/i)).toHaveCount(0);
    await expect(drawer.getByText(/At risk \/ tentative/i)).toHaveCount(0);
    await expect(drawer.getByText(/Archived/i)).toHaveCount(0);
    await expect(drawer.getByText(/Masked/i)).toHaveCount(0);
  });

  test("switches to day hour grid", async ({ page }) => {
    await page.getByLabel("Calendar period").getByRole("button", { name: "Day", exact: true }).click();
    await expect(
      page.getByLabel("Calendar period").getByRole("button", { name: "Day", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("schedule-day-view")).toBeVisible();
    await expect(page.getByText("All day", { exact: true })).toBeVisible();
  });

  test("shows resolved and proposed seed events for invitee", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Yavin 4 victory celebration/i }).first()).toBeVisible();
  });

  test("opens proposal detail from calendar block", async ({ page }) => {
    await page.getByRole("button", { name: /Yavin 4 victory celebration/i }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Yavin 4 victory celebration" }),
    ).toBeVisible();
  });

  test("can jump to today", async ({ page }) => {
    await page.getByLabel("Next period").click();
    await page.getByRole("button", { name: "Jump to today" }).click();
    const monday = new Date();
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const expectedStart = monday.toLocaleDateString(undefined, fmt);
    await expect(
      page.getByText(new RegExp(expectedStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
    ).toBeVisible();
  });

  test("switches to month view and opens day sheet from overflow", async ({ page }) => {
    await page.getByLabel("Calendar period").getByRole("button", { name: "Month" }).click();
    await expect(
      page.getByLabel("Calendar period").getByRole("button", { name: "Month" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Mon", { exact: true })).toBeVisible();

    const rangeStart = await page.getByTestId("schedule-range-start").getAttribute("data-value");
    const rangeEnd = await page.getByTestId("schedule-range-end").getAttribute("data-value");
    expect(rangeStart).toBeTruthy();
    expect(rangeEnd).toBeTruthy();
    const daySpan =
      (new Date(rangeEnd!).getTime() - new Date(rangeStart!).getTime()) / (24 * 60 * 60 * 1000);
    expect(daySpan).toBeGreaterThanOrEqual(34);

    await expect(
      page.getByRole("button", { name: /Yavin 4 victory celebration/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const moreLink = page.getByRole("button", { name: /Show \d+ more events|\+\d+ more/i }).first();
    if (await moreLink.isVisible().catch(() => false)) {
      await moreLink.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "Open in week" })).toBeVisible();
    }
  });
});
