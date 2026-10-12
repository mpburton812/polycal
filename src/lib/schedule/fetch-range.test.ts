import { describe, expect, it } from "vitest";

import {
  computeScheduleFetchRange,
  scheduleFetchRangeDayCount,
} from "./fetch-range";
import { localDateKey } from "./dates";

describe("computeScheduleFetchRange", () => {
  it("uses the full month grid for month layout", () => {
    const anchor = new Date(2099, 6, 15);
    const range = computeScheduleFetchRange(anchor, "month");
    expect(scheduleFetchRangeDayCount(range)).toBeGreaterThanOrEqual(41);
  });

  it("uses one week for week layout", () => {
    const anchor = new Date(2099, 6, 15);
    const range = computeScheduleFetchRange(anchor, "week");
    expect(scheduleFetchRangeDayCount(range)).toBeGreaterThanOrEqual(6);
    expect(scheduleFetchRangeDayCount(range)).toBeLessThanOrEqual(8);
  });

  it("uses one civil day in the viewer timezone for day layout", () => {
    const anchor = new Date("2099-07-15T19:30:00.000Z");
    const timeZone = "America/Los_Angeles";
    const range = computeScheduleFetchRange(anchor, "day", timeZone);
    expect(localDateKey(range.rangeStart.toISOString(), timeZone)).toBe("2099-07-15");
    expect(localDateKey(range.rangeEnd.toISOString(), timeZone)).toBe("2099-07-15");
    expect(range.rangeEnd.getTime()).toBeGreaterThan(range.rangeStart.getTime());
  });
});
