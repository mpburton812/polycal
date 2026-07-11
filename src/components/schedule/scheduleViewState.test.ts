import { describe, expect, it } from "vitest";

import {
  applyPeriodMode,
  buildScheduleUrlSearch,
  parseScheduleUrlParams,
  periodModeFromState,
  todayAnchors,
} from "@/components/schedule/scheduleViewState";

describe("scheduleViewState period mode", () => {
  it("maps week / twoWeek / month", () => {
    expect(periodModeFromState({ calendarLayout: "week", compact: false })).toBe("week");
    expect(periodModeFromState({ calendarLayout: "week", compact: true })).toBe("twoWeek");
    expect(periodModeFromState({ calendarLayout: "month", compact: false })).toBe("month");
  });

  it("applies period mode onto state", () => {
    const base = {
      weekStartIso: "2026-07-06T00:00:00.000Z",
      monthAnchorIso: "2026-07-01T00:00:00.000Z",
      calendarLayout: "week" as const,
      compact: false,
      filterMode: "whole" as const,
      filterPersonId: "",
      planningOpen: false,
    };
    expect(applyPeriodMode(base, "twoWeek").compact).toBe(true);
    expect(applyPeriodMode(base, "month").calendarLayout).toBe("month");
  });
});

describe("schedule URL helpers", () => {
  it("parses layout and open", () => {
    expect(parseScheduleUrlParams("layout=twoWeek&anchor=2026-07-11&open=p1")).toEqual({
      layout: "twoWeek",
      anchor: "2026-07-11",
      open: "p1",
    });
  });

  it("builds search from state", () => {
    const search = buildScheduleUrlSearch(
      {
        weekStartIso: "2026-07-06T12:00:00.000Z",
        monthAnchorIso: "2026-07-01T12:00:00.000Z",
        calendarLayout: "week",
        compact: true,
        filterMode: "whole",
        filterPersonId: "",
        planningOpen: false,
      },
      "abc",
    );
    expect(search).toContain("layout=twoWeek");
    expect(search).toContain("open=abc");
  });
});

describe("todayAnchors", () => {
  it("returns ISO strings", () => {
    const anchors = todayAnchors(new Date("2026-07-11T15:00:00"));
    expect(anchors.weekStartIso).toMatch(/2026-07/);
    expect(anchors.monthAnchorIso).toMatch(/2026-07/);
  });
});
