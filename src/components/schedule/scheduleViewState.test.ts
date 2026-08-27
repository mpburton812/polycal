import { describe, expect, it } from "vitest";

import {
  applyPeriodMode,
  buildScheduleUrlSearch,
  localCalendarDateKey,
  parseScheduleUrlParams,
  periodModeFromState,
  todayAnchors,
} from "@/components/schedule/scheduleViewState";

describe("scheduleViewState period mode", () => {
  it("maps day / week / month", () => {
    expect(periodModeFromState({ calendarLayout: "day" })).toBe("day");
    expect(periodModeFromState({ calendarLayout: "week" })).toBe("week");
    expect(periodModeFromState({ calendarLayout: "month" })).toBe("month");
  });

  it("applies period mode onto state", () => {
    const base = {
      weekStartIso: "2026-07-06T00:00:00.000Z",
      monthAnchorIso: "2026-07-01T00:00:00.000Z",
      calendarLayout: "week" as const,
      filterMode: "whole" as const,
      filterPersonId: "",
    };
    expect(applyPeriodMode(base, "month").calendarLayout).toBe("month");
    expect(applyPeriodMode(base, "day").calendarLayout).toBe("day");
    expect(applyPeriodMode(base, "week").calendarLayout).toBe("week");
  });
});

describe("schedule URL helpers", () => {
  it("parses layout and open", () => {
    expect(parseScheduleUrlParams("layout=day&anchor=2026-07-11&open=p1")).toEqual({
      layout: "day",
      anchor: "2026-07-11",
      open: "p1",
    });
    expect(parseScheduleUrlParams("layout=twoWeek&anchor=2026-07-11&open=p1")).toEqual({
      layout: "week",
      anchor: "2026-07-11",
      open: "p1",
    });
  });

  it("builds search from state using local calendar date", () => {
    const search = buildScheduleUrlSearch(
      {
        weekStartIso: "2026-07-06T12:00:00.000Z",
        monthAnchorIso: "2026-07-01T12:00:00.000Z",
        calendarLayout: "week",
        filterMode: "whole",
        filterPersonId: "",
      },
      "abc",
    );
    expect(search).toContain("layout=week");
    expect(search).toContain("open=abc");
    expect(search).toMatch(/anchor=\d{4}-\d{2}-\d{2}/);
  });

  it("builds day layout search", () => {
    const search = buildScheduleUrlSearch({
      weekStartIso: "2026-07-13T12:00:00.000Z",
      monthAnchorIso: "2026-07-01T12:00:00.000Z",
      calendarLayout: "day",
      filterMode: "whole",
      filterPersonId: "",
    });
    expect(search).toContain("layout=day");
  });
});

describe("localCalendarDateKey", () => {
  it("formats local yyyy-MM-dd", () => {
    expect(localCalendarDateKey(new Date(2026, 6, 13))).toBe("2026-07-13");
  });
});
describe("todayAnchors", () => {
  it("returns ISO strings", () => {
    const anchors = todayAnchors(new Date("2026-07-11T15:00:00"));
    expect(anchors.weekStartIso).toMatch(/2026-07/);
    expect(anchors.monthAnchorIso).toMatch(/2026-07/);
  });
});
