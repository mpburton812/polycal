import { describe, expect, it } from "vitest";

import {
  buildConflictWindows,
  widenConflictWindow,
  windowsConflict,
  type ConflictWindowRow,
} from "./conflict-windows";
import { sleepingDateToStartIso } from "./sleeping-schedule";

const TZ = "America/New_York";

const eventRow: ConflictWindowRow = {
  id: "a",
  proposalType: "event",
  isAllDay: false,
  isBatchSleeping: false,
  parentProposalId: null,
  isRecurrenceParent: false,
};

describe("widenConflictWindow", () => {
  it("leaves timed events unchanged", () => {
    const win = widenConflictWindow(
      "2026-07-01T18:00:00.000Z",
      "2026-07-01T19:00:00.000Z",
      "event",
      false,
      TZ,
    );
    expect(win).toEqual({
      start: "2026-07-01T18:00:00.000Z",
      end: "2026-07-01T19:00:00.000Z",
    });
  });

  it("widens a null-end sleeping night to the end of its civil day", () => {
    const start = sleepingDateToStartIso("2026-07-01", TZ)!;
    const win = widenConflictWindow(start, null, "sleeping", false, TZ);
    expect(win.start).toBe(start);
    // Civil day end is one millisecond before the next night's midnight-in-TZ.
    expect(win.end).toBe("2026-07-02T03:59:59.999Z");
  });

  it("widens an all-day noon-UTC point to the end of its civil day", () => {
    const win = widenConflictWindow(
      "2026-07-01T12:00:00.000Z",
      "2026-07-01T12:00:00.000Z",
      "event",
      true,
      TZ,
    );
    expect(win.start).toBe("2026-07-01T12:00:00.000Z");
    expect(win.end).toBe("2026-07-02T03:59:59.999Z");
  });
});

describe("windowsConflict (PC-318 / PC-59 parity)", () => {
  it("flags two same-day all-day events (noon/noon) as conflicting", () => {
    const scheduled = {
      startAt: "2026-07-01T12:00:00.000Z",
      endAt: "2026-07-01T12:00:00.000Z",
    };
    const a = buildConflictWindows({ ...eventRow, id: "a", isAllDay: true }, [], scheduled, TZ);
    const b = buildConflictWindows({ ...eventRow, id: "b", isAllDay: true }, [], scheduled, TZ);
    expect(windowsConflict("event", a, "event", b)).toBe(true);
  });

  it("flags two same-night sleeping arrangements with null ends as conflicting", () => {
    const start = sleepingDateToStartIso("2026-07-01", TZ)!;
    const row: ConflictWindowRow = { ...eventRow, proposalType: "sleeping" };
    const a = buildConflictWindows({ ...row, id: "a" }, [], { startAt: start, endAt: null }, TZ);
    const b = buildConflictWindows({ ...row, id: "b" }, [], { startAt: start, endAt: null }, TZ);
    expect(windowsConflict("sleeping", a, "sleeping", b)).toBe(true);
  });

  it("does NOT flag an event overlapping a sleeping night (PC-59)", () => {
    const nightStart = sleepingDateToStartIso("2026-07-01", TZ)!;
    const sleeping = buildConflictWindows(
      { ...eventRow, id: "s", proposalType: "sleeping" },
      [],
      { startAt: nightStart, endAt: null },
      TZ,
    );
    // An evening event squarely inside the sleeping night's civil day.
    const event = buildConflictWindows(
      { ...eventRow, id: "e" },
      [],
      { startAt: "2026-07-01T22:00:00.000Z", endAt: "2026-07-01T23:00:00.000Z" },
      TZ,
    );
    expect(windowsConflict("event", event, "sleeping", sleeping)).toBe(false);
  });

  it("does not flag sleeping nights on different civil days", () => {
    const row: ConflictWindowRow = { ...eventRow, proposalType: "sleeping" };
    const a = buildConflictWindows(
      { ...row, id: "a" },
      [],
      { startAt: sleepingDateToStartIso("2026-07-01", TZ)!, endAt: null },
      TZ,
    );
    const b = buildConflictWindows(
      { ...row, id: "b" },
      [],
      { startAt: sleepingDateToStartIso("2026-07-02", TZ)!, endAt: null },
      TZ,
    );
    expect(windowsConflict("sleeping", a, "sleeping", b)).toBe(false);
  });
});
