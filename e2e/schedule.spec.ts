import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToSchedule } from "./helpers/navigation";
import { activeMainPanel } from "./helpers/tab-swipe";

test.describe("Schedule calendar", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToSchedule(page);
  });

  test("shows weekly schedule view with period controls", async ({ page }) => {
    const root = activeMainPanel(page);
    await expect(root.getByRole("heading", { name: "Schedule", level: 1 })).toBeVisible();
    await expect(root.getByLabel("Previous period")).toBeVisible();
    await expect(root.getByLabel("Next period")).toBeVisible();
    await expect(root.getByRole("button", { name: "Jump to today" })).toBeVisible();
    await expect(root.getByLabel("Calendar period").getByRole("button", { name: "Daily", exact: true })).toBeVisible();
    await expect(root.getByLabel("Calendar period").getByRole("button", { name: "Weekly", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("view options has network filter without status legend", async ({ page }) => {
    await activeMainPanel(page).getByLabel("View options").click();
    const drawer = page.locator(".MuiDrawer-paper");
    await expect(drawer.getByLabel("Network filter")).toBeVisible();
    await expect(drawer.getByText(/Approved events/i)).toHaveCount(0);
    await expect(drawer.getByText(/At risk \/ tentative/i)).toHaveCount(0);
    await expect(drawer.getByText(/Archived/i)).toHaveCount(0);
    await expect(drawer.getByText(/Masked/i)).toHaveCount(0);
  });

  test("switches to day hour grid", async ({ page }) => {
    const root = activeMainPanel(page);
    await root.getByLabel("Calendar period").getByRole("button", { name: "Daily", exact: true }).click();
    await expect(
      root.getByLabel("Calendar period").getByRole("button", { name: "Daily", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(root.getByTestId("schedule-day-view").first()).toBeVisible();
    await expect(root.getByText("All day", { exact: true }).first()).toBeVisible();
  });

  test("shows resolved and proposed seed events for invitee", async ({ page }) => {
    await expect(
      activeMainPanel(page).getByRole("button", { name: /Yavin 4 victory celebration/i }).first(),
    ).toBeVisible();
  });

  test("opens proposal detail from calendar block", async ({ page }) => {
    await activeMainPanel(page)
      .getByRole("button", { name: /Yavin 4 victory celebration/i })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "Yavin 4 victory celebration" }),
    ).toBeVisible();
  });

  test("can jump to today", async ({ page }) => {
    const root = activeMainPanel(page);
    await root.getByLabel("Next period").click();
    await root.getByRole("button", { name: "Jump to today" }).click();
    const monday = new Date();
    const day = monday.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    monday.setDate(monday.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const expectedStart = monday.toLocaleDateString(undefined, fmt);
    await expect(
      root.getByText(new RegExp(expectedStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first(),
    ).toBeVisible();
  });

  test("switches to month view and opens day sheet from overflow", async ({ page }) => {
    const root = activeMainPanel(page);
    await root.getByLabel("Calendar period").getByRole("button", { name: "Monthly" }).click();
    await expect(
      root.getByLabel("Calendar period").getByRole("button", { name: "Monthly" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(root.getByText("Mon", { exact: true }).first()).toBeVisible();

    const rangeStart = await root.getByTestId("schedule-range-start").getAttribute("data-value");
    const rangeEnd = await root.getByTestId("schedule-range-end").getAttribute("data-value");
    expect(rangeStart).toBeTruthy();
    expect(rangeEnd).toBeTruthy();
    const daySpan =
      (new Date(rangeEnd!).getTime() - new Date(rangeStart!).getTime()) / (24 * 60 * 60 * 1000);
    expect(daySpan).toBeGreaterThanOrEqual(34);

    await expect(
      root.getByRole("button", { name: /Yavin 4 victory celebration/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    const moreLink = root.getByRole("button", { name: /Show \d+ more events|\+\d+ more/i }).first();
    if (await moreLink.isVisible().catch(() => false)) {
      await moreLink.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("button", { name: "Open in week" })).toBeVisible();
    }
  });
});
