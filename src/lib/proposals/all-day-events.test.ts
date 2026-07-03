import { describe, expect, it } from "vitest";

import {
  allDayEventFromDates,
  dateToEndIso,
  formatAllDayEventLabel,
  isAllDayEventSlot,
} from "./all-day-events";
import { sleepingDateToStartIso } from "./sleeping-schedule";

describe("allDayEventFromDates", () => {
  it("maps a single day to midnight through end of day", () => {
    const bounds = allDayEventFromDates("2099-07-10");
    expect(bounds).not.toBeNull();
    expect(bounds!.startAt).toBe(sleepingDateToStartIso("2099-07-10"));
    expect(bounds!.endAt).toBe(dateToEndIso("2099-07-10"));
  });

  it("maps a date range to inclusive all-day bounds", () => {
    const bounds = allDayEventFromDates("2099-07-10", "2099-07-12");
    expect(bounds!.startAt).toBe(sleepingDateToStartIso("2099-07-10"));
    expect(bounds!.endAt).toBe(dateToEndIso("2099-07-12"));
  });
});

describe("isAllDayEventSlot", () => {
  it("detects stored all-day bounds", () => {
    const bounds = allDayEventFromDates("2099-07-10")!;
    expect(isAllDayEventSlot(bounds.startAt, bounds.endAt)).toBe(true);
  });

  it("rejects timed events", () => {
    expect(isAllDayEventSlot("2099-07-10T14:30:00.000Z", "2099-07-10T16:00:00.000Z")).toBe(
      false,
    );
  });
});

describe("formatAllDayEventLabel", () => {
  it("labels a single-day all-day event", () => {
    const bounds = allDayEventFromDates("2099-07-10")!;
    expect(formatAllDayEventLabel(bounds.startAt, bounds.endAt)).toMatch(/^All day,/);
  });
});
