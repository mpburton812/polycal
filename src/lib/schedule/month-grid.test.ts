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
});
