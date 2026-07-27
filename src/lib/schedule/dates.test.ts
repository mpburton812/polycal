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
  it("returns Monday noon-UTC for a Wednesday in America/New_York", () => {
    const wed = new Date("2026-06-24T16:00:00.000Z"); // Wed afternoon UTC
    const monday = startOfWeekMonday(wed, "America/New_York");
    expect(localDateKey(monday.toISOString(), "America/New_York")).toBe("2026-06-22");
    expect(monday.toISOString()).toBe("2026-06-22T12:00:00.000Z");
  });

  it("returns prior Monday when date is Sunday in America/New_York", () => {
    const sun = new Date("2026-06-28T16:00:00.000Z");
    const monday = startOfWeekMonday(sun, "America/New_York");
    expect(localDateKey(monday.toISOString(), "America/New_York")).toBe("2026-06-22");
  });

  it("keeps Monday aligned when host is UTC but viewer is NY (PC-376)", () => {
    // Noon-UTC Monday stays Monday in New York; UTC midnight Monday is still Sunday evening NY.
    const utcMondayNoon = new Date("2026-08-10T12:00:00.000Z");
    const monday = startOfWeekMonday(utcMondayNoon, "America/New_York");
    expect(localDateKey(monday.toISOString(), "America/New_York")).toBe("2026-08-10");
    const sunday = addDays(monday, 6);
    expect(localDateKey(sunday.toISOString(), "America/New_York")).toBe("2026-08-16");

    const utcMondayMidnight = new Date("2026-08-10T00:00:00.000Z");
    expect(localDateKey(utcMondayMidnight.toISOString(), "America/New_York")).toBe("2026-08-09");
    expect(
      localDateKey(
        startOfWeekMonday(utcMondayMidnight, "America/New_York").toISOString(),
        "America/New_York",
      ),
    ).toBe("2026-08-03");
  });
});

describe("endOfWeekSunday", () => {
  it("ends on Sunday 23:59:59.999 UTC", () => {
    const monday = new Date("2026-06-22T12:00:00.000Z");
    const end = endOfWeekSunday(monday);
    expect(end.toISOString()).toBe("2026-06-28T23:59:59.999Z");
  });
});

describe("addDays", () => {
  it("adds days without mutating the source date", () => {
    const start = new Date("2026-01-01T12:00:00.000Z");
    const next = addDays(start, 3);
    expect(start.toISOString()).toBe("2026-01-01T12:00:00.000Z");
    expect(next.toISOString()).toBe("2026-01-04T12:00:00.000Z");
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
