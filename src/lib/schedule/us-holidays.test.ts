import { describe, expect, it } from "vitest";

import {
  getUsHolidaysForYear,
  getUsHolidayScheduleEvents,
  isUsHolidayEventId,
} from "@/lib/schedule/us-holidays";

describe("us-holidays (PC-493)", () => {
  it("computes fixed and floating holidays for 2026", () => {
    const holidays = getUsHolidaysForYear(2026);
    expect(holidays.find((h) => h.title === "Independence Day")?.dateKey).toBe("2026-07-04");
    expect(holidays.find((h) => h.title === "Thanksgiving Day")?.dateKey).toBe("2026-11-26");
    expect(holidays.find((h) => h.title === "Memorial Day")?.dateKey).toBe("2026-05-25");
    expect(holidays.find((h) => h.title === "Labor Day")?.dateKey).toBe("2026-09-07");
  });

  it("builds all-day schedule events in range without participants", () => {
    const events = getUsHolidayScheduleEvents(
      "2026-07-01T00:00:00.000Z",
      "2026-07-10T00:00:00.000Z",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Independence Day");
    expect(events[0]?.isAllDay).toBe(true);
    expect(events[0]?.participantIds).toEqual([]);
    expect(isUsHolidayEventId(events[0]?.id)).toBe(true);
  });
});
