import { describe, expect, it } from "vitest";

import { allDayEventFromDates } from "@/lib/proposals/all-day-events";
import { buildMonthGrid, eventSpanInGrid } from "./month-grid";

describe("eventSpanInGrid", () => {
  const grid = buildMonthGrid(new Date(2026, 6, 1)); // July 2026
  const timeZone = "America/New_York";

  it("keeps a timed same-day event in one column", () => {
    const span = eventSpanInGrid(
      grid,
      "2026-07-10T14:00:00-04:00",
      "2026-07-10T17:00:00-04:00",
      timeZone,
    );
    expect(span).not.toBeNull();
    expect(span!.startIndex).toBe(span!.endIndex);
  });

  it("keeps a short overnight event on the start day in month view", () => {
    const span = eventSpanInGrid(
      grid,
      "2026-07-10T22:00:00-04:00",
      "2026-07-11T01:00:00-04:00",
      timeZone,
    );
    expect(span).not.toBeNull();
    expect(span!.startIndex).toBe(span!.endIndex);
  });

  it("keeps a single-day all-day event in one column when end spills to next UTC date", () => {
    const bounds = allDayEventFromDates("2026-07-10")!;
    const span = eventSpanInGrid(grid, bounds.startAt, bounds.endAt, "UTC");
    expect(span).not.toBeNull();
    expect(span!.startIndex).toBe(span!.endIndex);
  });

  it("spans multiple columns for multi-day all-day events", () => {
    const bounds = allDayEventFromDates("2026-07-10", "2026-07-12")!;
    const span = eventSpanInGrid(grid, bounds.startAt, bounds.endAt, "America/New_York");
    expect(span).not.toBeNull();
    expect(span!.endIndex).toBeGreaterThan(span!.startIndex);
  });
});
