import { describe, expect, it } from "vitest";

import {
  computeScheduleFetchRange,
  scheduleFetchRangeDayCount,
} from "./fetch-range";

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

  it("uses a single local calendar day for day layout", () => {
    const anchor = new Date(2099, 6, 15, 15, 30, 0);
    const range = computeScheduleFetchRange(anchor, "day");
    expect(range.rangeStart.getHours()).toBe(0);
    expect(range.rangeEnd.getHours()).toBe(23);
    expect(scheduleFetchRangeDayCount(range)).toBe(1);
  });
});
