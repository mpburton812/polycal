import { expect, testManualDb as test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resetE2eDatabase } from "./helpers/db";
import { goToSchedule } from "./helpers/navigation";
import {
  createAndSubmitAllDaySpan,
  dateOffsetIso,
  navigateScheduleUntilDateInRange,
  selectScheduleOneWeekView,
  waitForScheduleReady,
} from "./helpers/schedule";
import { activeMainPanel } from "./helpers/tab-swipe";

/**
 * Friday–Sunday of the week after this Monday (outside the SSR current-week payload).
 * Retargeted from 2-week view after PC-488 removed that mode.
 */
function nextWeekFridaySunday(): { startDate: string; endDate: string } {
  const today = dateOffsetIso(0);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  const utcDay = noon.getUTCDay();
  const fromMonday = utcDay === 0 ? 6 : utcDay - 1;
  const fridayWeek2 = 11 - fromMonday;
  return {
    startDate: dateOffsetIso(fridayWeek2),
    endDate: dateOffsetIso(fridayWeek2 + 2),
  };
}

test.describe("Overlapping multi-day events stay visible across week navigation", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test("second overlapping Fri–Sun span does not blank the first without reload", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { startDate, endDate } = nextWeekFridaySunday();
    const firstTitle = `E2E Overlap Con ${Date.now()}`;
    const secondTitle = `E2E Overlap Libertine ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToSchedule(page);
    await selectScheduleOneWeekView(page);
    await navigateScheduleUntilDateInRange(page, startDate);
    await waitForScheduleReady(page);

    await createAndSubmitAllDaySpan(page, {
      title: firstTitle,
      startDate,
      endDate,
    });
    await waitForScheduleReady(page);
    const panel = activeMainPanel(page);
    // Multi-day all-day blocks paint once per civil day (Fri/Sat/Sun).
    await expect(panel.getByRole("button", { name: new RegExp(firstTitle, "i") }).first()).toBeVisible({
      timeout: 30_000,
    });

    await createAndSubmitAllDaySpan(page, {
      title: secondTitle,
      startDate,
      endDate,
    });
    await waitForScheduleReady(page);

    await expect(panel.getByRole("button", { name: new RegExp(firstTitle, "i") }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByRole("button", { name: new RegExp(secondTitle, "i") }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/schedule/);
  });
});
