import { describe, expect, it } from "vitest";

import {
  computeScheduleFetchRange,
  scheduleFetchRangeDayCount,
} from "./fetch-range";

describe("computeScheduleFetchRange", () => {
  it("uses the full month grid for month layout", () => {
    const anchor = new Date(2099, 6, 15);
    const range = computeScheduleFetchRange(anchor, "month", false);
    expect(scheduleFetchRangeDayCount(range)).toBeGreaterThanOrEqual(41);
  });

  it("uses one week for normal week layout", () => {
    const anchor = new Date(2099, 6, 15);
    const range = computeScheduleFetchRange(anchor, "week", false);
    expect(scheduleFetchRangeDayCount(range)).toBeGreaterThanOrEqual(6);
    expect(scheduleFetchRangeDayCount(range)).toBeLessThanOrEqual(8);
  });

  it("uses fourteen days for compact week layout", () => {
    const anchor = new Date(2099, 6, 15);
    const range = computeScheduleFetchRange(anchor, "week", true);
    expect(scheduleFetchRangeDayCount(range)).toBeGreaterThanOrEqual(13);
    expect(scheduleFetchRangeDayCount(range)).toBeLessThanOrEqual(15);
  });
});
