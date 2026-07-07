import { describe, expect, it } from "vitest";

import {
  isoToSleepingDateInput,
  sleepingCalendarDayEnd,
  sleepingDateToStartIso,
  sleepingScheduleFromDates,
  sleepingScheduleFromSlotRows,
} from "./sleeping-schedule";

describe("sleepingDateToStartIso", () => {
  it("returns local midnight ISO for a valid date", () => {
    const iso = sleepingDateToStartIso("2099-07-10");
    expect(iso).toBeTruthy();
    expect(isoToSleepingDateInput(iso!)).toBe("2099-07-10");
  });

  it("returns undefined for empty or invalid input", () => {
    expect(sleepingDateToStartIso("")).toBeUndefined();
    expect(sleepingDateToStartIso("not-a-date")).toBeUndefined();
  });
});

describe("sleepingScheduleFromDates", () => {
  it("uses null end for single-night arrangements", () => {
    const { start, end } = sleepingScheduleFromDates("2099-07-10");
    expect(start).toBeTruthy();
    expect(end).toBeNull();
  });

  it("uses null end when end date equals start date", () => {
    const { end } = sleepingScheduleFromDates("2099-07-10", "2099-07-10");
    expect(end).toBeNull();
  });

  it("sets end when spanning multiple nights", () => {
    const { start, end } = sleepingScheduleFromDates("2099-07-10", "2099-07-12");
    expect(start).toBeTruthy();
    expect(end).toBeTruthy();
    expect(isoToSleepingDateInput(end!)).toBe("2099-07-12");
  });
});

describe("sleepingCalendarDayEnd", () => {
  it("returns local end of the calendar day for a sleeping night", () => {
    const start = sleepingDateToStartIso("2099-08-01")!;
    const end = sleepingCalendarDayEnd(start);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getDate()).toBe(1);
    expect(end.getMonth()).toBe(7);
  });
});

describe("sleepingScheduleFromSlotRows", () => {
  it("derives single-night bounds when slots share the same date", () => {
    const start = sleepingDateToStartIso("2099-08-01")!;
    const result = sleepingScheduleFromSlotRows([
      { startAt: start, endAt: null },
      { startAt: start, endAt: null },
    ]);
    expect(isoToSleepingDateInput(result.start!)).toBe("2099-08-01");
    expect(result.end).toBeNull();
  });

  it("derives multi-night bounds from first and last slot dates", () => {
    const result = sleepingScheduleFromSlotRows([
      { startAt: sleepingDateToStartIso("2099-08-02")!, endAt: null },
      { startAt: sleepingDateToStartIso("2099-08-01")!, endAt: null },
    ]);
    expect(isoToSleepingDateInput(result.start!)).toBe("2099-08-01");
    expect(isoToSleepingDateInput(result.end!)).toBe("2099-08-02");
  });

  it("returns null bounds for empty slots", () => {
    expect(sleepingScheduleFromSlotRows([])).toEqual({ start: null, end: null });
  });
});
