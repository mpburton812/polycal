import { describe, expect, it } from "vitest";

import { buildMonthGrid, monthGridRange } from "./month-grid";

describe("monthGridRange", () => {
  it("covers the full 42-cell month grid", () => {
    const anchor = new Date(2099, 6, 15);
    const grid = buildMonthGrid(anchor);
    const { rangeStart, rangeEnd } = monthGridRange(anchor);

    expect(grid[0]!.toDateString()).toBe(rangeStart.toDateString());
    expect(grid[grid.length - 1]!.toDateString()).toBe(rangeEnd.toDateString());
    expect(grid.length).toBe(42);
  });
});
