import { describe, expect, it } from "vitest";

import {
  addDays,
  endOfWeekSunday,
  eventInRange,
  formatEventTime,
  intervalsOverlap,
  isSameLocalCalendarDay,
  localDateKey,
  startOfWeekMonday,
} from "./dates";

describe("isSameLocalCalendarDay", () => {
  it("returns true for same local day at different times", () => {
    const morning = new Date(2026, 6, 10, 8, 0, 0);
    const evening = new Date(2026, 6, 10, 22, 30, 0);
    expect(isSameLocalCalendarDay(morning, evening)).toBe(true);
  });

  it("returns false across midnight", () => {
    const late = new Date(2026, 6, 10, 23, 0, 0);
    const next = new Date(2026, 6, 11, 0, 30, 0);
    expect(isSameLocalCalendarDay(late, next)).toBe(false);
  });
});

describe("startOfWeekMonday", () => {
  it("returns Monday for a Wednesday", () => {
    const wed = new Date(2026, 5, 24); // Jun 24 2026 is Wednesday
    const monday = startOfWeekMonday(wed);
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(22);
  });

  it("returns prior Monday when date is Sunday", () => {
    const sun = new Date(2026, 5, 28); // Jun 28 2026 is Sunday
    const monday = startOfWeekMonday(sun);
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(22);
  });
});

describe("endOfWeekSunday", () => {
  it("ends on Sunday 23:59:59.999", () => {
    const monday = new Date(2026, 5, 22, 0, 0, 0, 0);
    const end = endOfWeekSunday(monday);
    expect(end.getDay()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});

describe("addDays", () => {
  it("adds days without mutating the source date", () => {
    const start = new Date(2026, 0, 1);
    const next = addDays(start, 3);
    expect(start.getDate()).toBe(1);
    expect(next.getDate()).toBe(4);
  });
});

describe("intervalsOverlap", () => {
  it("detects overlapping intervals", () => {
    expect(
      intervalsOverlap(
        "2026-06-01T10:00:00.000Z",
        "2026-06-01T12:00:00.000Z",
        "2026-06-01T11:00:00.000Z",
        "2026-06-01T13:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("treats null end as a point interval", () => {
    expect(
      intervalsOverlap(
        "2026-06-01T10:00:00.000Z",
        null,
        "2026-06-01T09:00:00.000Z",
        "2026-06-01T11:00:00.000Z",
      ),
    ).toBe(true);
  });

  it("returns false for non-overlapping intervals", () => {
    expect(
      intervalsOverlap(
        "2026-06-01T10:00:00.000Z",
        "2026-06-01T11:00:00.000Z",
        "2026-06-01T12:00:00.000Z",
        "2026-06-01T13:00:00.000Z",
      ),
    ).toBe(false);
  });
});

describe("eventInRange", () => {
  it("includes events that intersect the visible range", () => {
    expect(
      eventInRange(
        "2026-06-10T10:00:00.000Z",
        "2026-06-10T12:00:00.000Z",
        "2026-06-01T00:00:00.000Z",
        "2026-06-30T23:59:59.999Z",
      ),
    ).toBe(true);
  });
});

describe("localDateKey", () => {
  it("returns yyyy-mm-dd in UTC", () => {
    expect(localDateKey("2026-06-25T15:30:00.000Z", "UTC")).toBe("2026-06-25");
  });
});

describe("formatEventTime", () => {
  it("shows a single night date for sleeping arrangements", () => {
    const label = formatEventTime(
      "2026-06-26T04:00:00.000Z",
      "2026-06-27T04:00:00.000Z",
      "sleeping",
      "UTC",
    );
    expect(label).not.toContain("–");
    expect(label).toMatch(/Jun/i);
    expect(label).toMatch(/26/);
  });

  it("formats same-day evening events in the viewer timezone (PC-117)", () => {
    const startAt = "2026-07-16T22:00:00.000Z";
    const endAt = "2026-07-17T00:40:00.000Z";
    const label = formatEventTime(startAt, endAt, "event", "America/New_York");
    expect(label).toMatch(/6:00/);
    expect(label).toMatch(/8:40/);
    expect(label).not.toMatch(/Jul 17/);
    expect(localDateKey(startAt, "America/New_York")).toBe(
      localDateKey(endAt, "America/New_York"),
    );
  });
});
