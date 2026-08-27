import { describe, expect, it } from "vitest";

import { startOfWeekMonday } from "@/lib/schedule/dates";
import { ssrWeekCoversVisibleRange } from "@/lib/schedule/visible-payload";

const TZ = "America/New_York";
const monday = startOfWeekMonday(new Date("2026-08-24T16:00:00.000Z"), TZ);
const nextMonday = startOfWeekMonday(new Date("2026-08-31T16:00:00.000Z"), TZ);

describe("ssrWeekCoversVisibleRange", () => {
  it("covers a 1-week view on the SSR Monday", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "week",
        visibleAnchor: monday,
        ssrWeekStart: monday,
        timeZone: TZ,
      }),
    ).toBe(true);
  });

  it("rejects month layout", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "month",
        visibleAnchor: monday,
        ssrWeekStart: monday,
        timeZone: TZ,
      }),
    ).toBe(false);
  });

  it("rejects day layout", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "day",
        visibleAnchor: monday,
        ssrWeekStart: monday,
        timeZone: TZ,
      }),
    ).toBe(false);
  });

  it("rejects a 1-week view whose Monday is not the SSR week", () => {
    expect(
      ssrWeekCoversVisibleRange({
        layout: "week",
        visibleAnchor: nextMonday,
        ssrWeekStart: monday,
        timeZone: TZ,
      }),
    ).toBe(false);
  });
});
