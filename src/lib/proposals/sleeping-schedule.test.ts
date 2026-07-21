import { describe, expect, it } from "vitest";

import {
  isoToSleepingDateInput,
  sleepingCalendarDayEnd,
  sleepingDateToStartIso,
  sleepingScheduleFromDates,
  sleepingScheduleFromSlotRows,
} from "./sleeping-schedule";

const TZ = "America/New_York";

describe("sleepingDateToStartIso", () => {
  it("returns midnight in the given IANA timezone for a valid date", () => {
    const iso = sleepingDateToStartIso("2099-07-10", TZ);
    expect(iso).toBeTruthy();
    expect(isoToSleepingDateInput(iso!, TZ)).toBe("2099-07-10");
    // Eastern daylight time → 04:00Z
    expect(iso).toBe("2099-07-10T04:00:00.000Z");
  });

  it("differs from UTC midnight interpretation for US Eastern", () => {
    const eastern = sleepingDateToStartIso("2099-01-15", "America/New_York");
    const utc = sleepingDateToStartIso("2099-01-15", "UTC");
    expect(eastern).toBe("2099-01-15T05:00:00.000Z");
    expect(utc).toBe("2099-01-15T00:00:00.000Z");
  });

  it("returns undefined for empty or invalid input", () => {
    expect(sleepingDateToStartIso("")).toBeUndefined();
    expect(sleepingDateToStartIso("not-a-date")).toBeUndefined();
  });
});

describe("sleepingScheduleFromDates", () => {
  it("uses null end for single-night arrangements", () => {
    const { start, end } = sleepingScheduleFromDates("2099-07-10", null, TZ);
    expect(start).toBeTruthy();
    expect(end).toBeNull();
  });

  it("uses null end when end date equals start date", () => {
    const { end } = sleepingScheduleFromDates("2099-07-10", "2099-07-10", TZ);
    expect(end).toBeNull();
  });

  it("sets end when spanning multiple nights", () => {
    const { start, end } = sleepingScheduleFromDates("2099-07-10", "2099-07-12", TZ);
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(isoToSleepingDateInput(end!, TZ)).toBe("2099-07-12");
  });
});

describe("sleepingCalendarDayEnd", () => {
  it("returns end of the civil day in the given timezone", () => {
    const start = sleepingDateToStartIso("2099-08-01", TZ)!;
    const end = sleepingCalendarDayEnd(start, TZ);
    // Next midnight Eastern (EDT) minus 1ms
    expect(end.toISOString()).toBe("2099-08-02T03:59:59.999Z");
    expect(isoToSleepingDateInput(end.toISOString(), TZ)).toBe("2099-08-01");
  });
});

describe("sleepingScheduleFromSlotRows", () => {
  it("derives single-night bounds when slots share the same date", () => {
    const start = sleepingDateToStartIso("2099-08-01", TZ)!;
    const result = sleepingScheduleFromSlotRows(
      [
        { startAt: start, endAt: null },
        { startAt: start, endAt: null },
      ],
      TZ,
    );
    expect(isoToSleepingDateInput(result.start!, TZ)).toBe("2099-08-01");
    expect(result.end).toBeNull();
  });

  it("derives multi-night bounds from first and last slot dates", () => {
    const result = sleepingScheduleFromSlotRows(
      [
        { startAt: sleepingDateToStartIso("2099-08-02", TZ)!, endAt: null },
        { startAt: sleepingDateToStartIso("2099-08-01", TZ)!, endAt: null },
      ],
      TZ,
    );
    expect(isoToSleepingDateInput(result.start!, TZ)).toBe("2099-08-01");
    expect(isoToSleepingDateInput(result.end!, TZ)).toBe("2099-08-02");
  });

  it("returns null bounds for empty slots", () => {
    expect(sleepingScheduleFromSlotRows([])).toEqual({ start: null, end: null });
  });
});
