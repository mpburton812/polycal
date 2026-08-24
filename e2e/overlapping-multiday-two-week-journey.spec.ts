import { expect, testManualDb as test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resetE2eDatabase } from "./helpers/db";
import { goToSchedule } from "./helpers/navigation";
import { createAndSubmitAllDaySpan, dateOffsetIso, selectScheduleTwoWeekView, waitForScheduleReady } from "./helpers/schedule";
import { activeMainPanel } from "./helpers/tab-swipe";

/**
 * Friday–Sunday of the second week in a 2-week view that starts this Monday.
 * Those days sit outside the SSR current-week payload (PC-474).
 */
function secondWeekFridaySunday(): { startDate: string; endDate: string } {
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

test.describe("Overlapping multi-day events stay visible in 2-week view", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test("second overlapping Fri–Sun span does not blank the first without reload", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { startDate, endDate } = secondWeekFridaySunday();
    const firstTitle = `E2E Overlap Con ${Date.now()}`;
    const secondTitle = `E2E Overlap Libertine ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToSchedule(page);
    await selectScheduleTwoWeekView(page);
    await waitForScheduleReady(page);

    await createAndSubmitAllDaySpan(page, {
      title: firstTitle,
      startDate,
      endDate,
    });
    await waitForScheduleReady(page);
    const panel = activeMainPanel(page);
    await expect(panel.getByRole("button", { name: new RegExp(firstTitle, "i") })).toBeVisible({
      timeout: 30_000,
    });

    await createAndSubmitAllDaySpan(page, {
      title: secondTitle,
      startDate,
      endDate,
    });
    await waitForScheduleReady(page);

    await expect(panel.getByRole("button", { name: new RegExp(firstTitle, "i") })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByRole("button", { name: new RegExp(secondTitle, "i") })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).toHaveURL(/\/schedule/);
  });
});
