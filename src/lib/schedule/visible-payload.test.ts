import { describe, expect, it } from "vitest";

import { startOfWeekSunday } from "@/lib/schedule/dates";
import { ssrWeekCoversVisibleRange } from "@/lib/schedule/visible-payload";

const TZ = "America/New_York";
const sunday = startOfWeekSunday(new Date("2026-08-24T16:00:00.000Z"), TZ);
const nextSunday = startOfWeekSunday(new Date("2026-08-31T16:00:00.000Z"), TZ);

describe("ssrWeekCoversVisibleRange", () => {
  it("covers a 1-week view on the SSR Sunday", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "week",
        visibleAnchor: sunday,
        ssrWeekStart: sunday,
        timeZone: TZ,
      }),
    ).toBe(true);
  });

  it("rejects month layout", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "month",
        visibleAnchor: sunday,
        ssrWeekStart: sunday,
        timeZone: TZ,
      }),
    ).toBe(false);
  });

  it("rejects day layout", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "day",
        visibleAnchor: sunday,
        ssrWeekStart: sunday,
        timeZone: TZ,
      }),
    ).toBe(false);
  });

  it("rejects a 1-week view whose Sunday is not the SSR week", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "week",
        visibleAnchor: nextSunday,
        ssrWeekStart: sunday,
        timeZone: TZ,
      }),
    ).toBe(false);
  });
});
