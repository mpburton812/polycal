import { describe, expect, it } from "vitest";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  buildScheduleSegment,
  mergeScheduleEvents,
  normalizeSegmentAnchor,
  shiftSegmentAnchor,
  trimScheduleSegments,
} from "./segments";

const TZ = "America/New_York";

describe("schedule segments", () => {
  it("normalizes week anchors to Monday", () => {
    const wed = new Date("2026-07-15T15:00:00.000Z");
    const monday = normalizeSegmentAnchor(wed, "week", TZ);
    expect(monday.getUTCDay()).toBe(1);
  });

  it("shifts day / week / month anchors", () => {
    const day = normalizeSegmentAnchor(new Date("2026-07-15T12:00:00.000Z"), "day", TZ);
    const nextDay = shiftSegmentAnchor(day, "day", 1, TZ);
    expect(nextDay.getTime()).toBeGreaterThan(day.getTime());

    const week = normalizeSegmentAnchor(new Date("2026-07-15T12:00:00.000Z"), "week", TZ);
    const nextWeek = shiftSegmentAnchor(week, "week", 1, TZ);
    expect((nextWeek.getTime() - week.getTime()) / (24 * 60 * 60 * 1000)).toBeCloseTo(7, 0);

    const month = normalizeSegmentAnchor(new Date("2026-07-15T12:00:00.000Z"), "month", TZ);
    const nextMonth = shiftSegmentAnchor(month, "month", 1, TZ);
    expect(nextMonth.getUTCMonth()).not.toBe(month.getUTCMonth());
  });

  it("builds segment ids from normalized anchors", () => {
    const segment = buildScheduleSegment(
      new Date("2026-07-15T15:00:00.000Z"),
      "week",
      [],
      TZ,
    );
    expect(segment.id).toBe(segment.anchorIso);
    expect(segment.rangeEndIso > segment.rangeStartIso).toBe(true);
  });

  it("merges events by id", () => {
    const a = { id: "1", title: "A" } as ScheduleEvent;
    const b = { id: "2", title: "B" } as ScheduleEvent;
    const a2 = { id: "1", title: "A2" } as ScheduleEvent;
    expect(mergeScheduleEvents([a, b], [a2]).map((e) => e.title).sort()).toEqual(["A2", "B"]);
  });

  it("trims from the far edge", () => {
    const segments = [1, 2, 3, 4].map((n) => ({
      id: String(n),
      anchorIso: String(n),
      rangeStartIso: String(n),
      rangeEndIso: String(n),
      events: [] as ScheduleEvent[],
    }));
    expect(trimScheduleSegments(segments, "future", 3).map((s) => s.id)).toEqual(["2", "3", "4"]);
    expect(trimScheduleSegments(segments, "past", 3).map((s) => s.id)).toEqual(["1", "2", "3"]);
  });
});
