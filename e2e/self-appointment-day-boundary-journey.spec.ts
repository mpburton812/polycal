import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProposals } from "./helpers/navigation";
import {
  createAndSubmitSoloRecurringTimedEvent,
  createAndSubmitSoloTimedEvent,
  expectResolvedProposal,
} from "./helpers/proposals";
import {
  assertEventOnCalendarDays,
  shiftIsoDate,
  timedAppointmentWindow,
} from "./helpers/schedule";

const COMMENT = "E2E self-appointment day boundary";
/**
 * Prefer mid-week targets: DAYS_OUT=3 from Thu/Fri lands on Sun, and 11pm→midnight
 * overnight events can fall off the visible week range (flake after local midnight).
 * Use 7 days out so 12am 1h blocks stay inside a full upcoming week on CI.
 * Playwright timezoneId is America/New_York (matches luke) so 12am drafts land on
 * the same civil day the schedule asserts (PC-408).
 */
const DAYS_OUT = 7;
const WEEKLY_OCCURRENCES = 3;

type Case = {
  name: string;
  startHour: number;
  durationHours: number;
  recurring: boolean;
};

/**
 * Unique cases from the product ask (duplicate 11pm rows collapsed).
 * PC-326 / REQ-E2E-APPT-DAY-001.
 */
const CASES: Case[] = [
  { name: "1h at 12am", startHour: 0, durationHours: 1, recurring: false },
  { name: "1h at 11pm", startHour: 23, durationHours: 1, recurring: false },
  { name: "1h at 12am weekly ×3", startHour: 0, durationHours: 1, recurring: true },
  { name: "1h at 11pm weekly ×3", startHour: 23, durationHours: 1, recurring: true },
  { name: "2d at 12am", startHour: 0, durationHours: 48, recurring: false },
  { name: "2d at 11pm", startHour: 23, durationHours: 48, recurring: false },
  { name: "2d at 12am weekly ×3", startHour: 0, durationHours: 48, recurring: true },
  { name: "2d at 11pm weekly ×3", startHour: 23, durationHours: 48, recurring: true },
];

function expectedStartDays(startDay: string, recurring: boolean): string[] {
  if (!recurring) return [startDay];
  return [0, 1, 2].map((week) => shiftIsoDate(startDay, week * 7));
}

test.describe("Self-appointment day-boundary journey", () => {
  for (const scenario of CASES) {
    test(`${scenario.name}: lands on the expected calendar day(s)`, async ({ page }) => {
      test.setTimeout(240_000);

      const title = `E2E Appt ${scenario.name} ${Date.now()}`;
      const window = timedAppointmentWindow(DAYS_OUT, scenario.startHour, scenario.durationHours);
      const days = expectedStartDays(window.startDay, scenario.recurring);

      await login(page, USERS.luke.username);
      await goToProposals(page);

      if (scenario.recurring) {
        await createAndSubmitSoloRecurringTimedEvent(page, {
          title,
          comment: COMMENT,
          start: window.start,
          end: window.end,
          occurrenceCount: WEEKLY_OCCURRENCES,
        });
      } else {
        await createAndSubmitSoloTimedEvent(page, {
          title,
          comment: COMMENT,
          start: window.start,
          end: window.end,
        });
      }

      await expectResolvedProposal(page, title);
      await assertEventOnCalendarDays(page, new RegExp(title, "i"), days);

      // Spot-check start day is still the primary placement (midnight / 11pm boundaries).
      expect(window.start.startsWith(window.startDay)).toBe(true);
      if (scenario.startHour === 23 && scenario.durationHours === 1) {
        // 11pm + 1h crosses midnight — end day must be the next calendar day.
        expect(window.endDay).toBe(shiftIsoDate(window.startDay, 1));
      }
    });
  }
});
