import { describe, expect, it } from "vitest";

import { localDateKey } from "./dates";
import { buildMonthGrid, monthGridRange } from "./month-grid";

describe("monthGridRange", () => {
  it("covers the full 42-cell month grid", () => {
    const anchor = new Date("2099-07-15T12:00:00.000Z");
    const grid = buildMonthGrid(anchor, "America/New_York");
    const { rangeStart, rangeEnd } = monthGridRange(anchor, "America/New_York");

    expect(grid.length).toBe(42);
    expect(localDateKey(rangeStart.toISOString(), "America/New_York")).toBe(
      localDateKey(grid[0]!.toISOString(), "America/New_York"),
    );
    expect(localDateKey(rangeEnd.toISOString(), "America/New_York")).toBe(
      localDateKey(grid[grid.length - 1]!.toISOString(), "America/New_York"),
    );
  });

  it("includes afternoon events on the last overflow day (PC-411)", () => {
    // August 2026 grid ends Sunday 2026-09-06; 10:00 ET is after noon-UTC.
    const anchor = new Date("2026-08-04T12:00:00.000Z");
    const { rangeEnd } = monthGridRange(anchor, "America/New_York");
    const eventAt = Date.parse("2026-09-06T14:00:00.000Z"); // 10:00 America/New_York (EDT)
    expect(eventAt).toBeLessThanOrEqual(rangeEnd.getTime());
  });
});
