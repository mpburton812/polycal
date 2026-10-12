import { describe, expect, it } from "vitest";

import { eventInRange } from "./dates";
import { sleepingCalendarDayEnd, sleepingDateToStartIso } from "../proposals/sleeping-schedule";

describe("tonight sleeping night stays in the day range", () => {
  it("includes a midnight point once the night occupies the civil day", () => {
    const timeZone = "America/Los_Angeles";
    const start = sleepingDateToStartIso("2099-07-15", timeZone)!;
    const dayEnd = sleepingCalendarDayEnd(start, timeZone).toISOString();
    const rangeStart = start;
    const rangeEnd = dayEnd;
    expect(eventInRange(start, null, rangeStart, rangeEnd)).toBe(false);
    expect(eventInRange(start, dayEnd, rangeStart, rangeEnd)).toBe(true);
  });
});
