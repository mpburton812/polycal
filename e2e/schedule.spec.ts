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
    const rescueHan = page.getByRole("button", { name: /Rescue Han from carbonite/i });

    /** Proposed seed slots use ensureFuture and may render in a later week than resolved events. */
    async function waitForScheduleReady(): Promise<void> {
      await expect(page.getByLabel("Next period")).toBeEnabled({ timeout: 10_000 });
    }

    if (await rescueHan.isVisible({ timeout: 3_000 }).catch(() => false)) {
      return;
    }

    for (let week = 0; week < 6; week += 1) {
      await page.getByLabel("Next period").click();
      await waitForScheduleReady();
      if (await rescueHan.isVisible({ timeout: 5_000 }).catch(() => false)) {
        return;
      }
    }

    await expect(rescueHan).toBeVisible({ timeout: 5_000 });
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

  test("switches to compact two-week view", async ({ page }) => {
    await page.getByRole("button", { name: "2 weeks" }).click();
    await expect(page.getByRole("button", { name: "2 weeks" })).toHaveAttribute("aria-pressed", "true");
  });
});
