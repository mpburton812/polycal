import { describe, expect, it } from "vitest";

import {
  allDayBoundsForDateKey,
  buildScheduleWindows,
  expandAllDayDateKeys,
  isMultiDayAllDaySpan,
} from "./schedule-slices";

const baseRow = {
  id: "prop-parent",
  isAllDay: false,
  isBatchSleeping: false,
  parentProposalId: null as string | null,
  isRecurrenceParent: false,
};

describe("schedule-slices", () => {
  it("emits occurrence 0 windows for recurrence parent rows", () => {
    const windows = buildScheduleWindows(
      { ...baseRow, isRecurrenceParent: true },
      [{ id: "s1", startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-07-01T01:00:00.000Z", label: null }],
      null,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]?.slice).toMatchObject({
      sliceKind: "recurrence_occurrence",
      rootProposalId: "prop-parent",
      occurrenceProposalId: "prop-parent",
    });
  });

  it("tags batch sleeping slots as batch_night", () => {
    const windows = buildScheduleWindows(
      { ...baseRow, isBatchSleeping: true },
      [
        {
          id: "slot-a",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: "2026-07-02T00:00:00.000Z",
          label: null,
        },
      ],
      null,
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]?.slice).toMatchObject({
      sliceKind: "batch_night",
      rootProposalId: "prop-parent",
      sliceKey: "slot-a",
    });
  });

  it("expands multi-day all-day spans into virtual_span_day windows", () => {
    expect(
      isMultiDayAllDaySpan(
        "2026-07-01T00:00:00.000Z",
        "2026-07-03T23:59:59.999Z",
        true,
        "UTC",
      ),
    ).toBe(true);
    expect(
      expandAllDayDateKeys("2026-07-01T00:00:00.000Z", "2026-07-03T23:59:59.999Z", "UTC"),
    ).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);

    const windows = buildScheduleWindows(
      { ...baseRow, isAllDay: true },
      [],
      {
        startAt: "2026-07-01T00:00:00.000Z",
        endAt: "2026-07-03T23:59:59.999Z",
      },
      "UTC",
    );
    expect(windows).toHaveLength(3);
    expect(windows.map((w) => w.slice.sliceKind)).toEqual([
      "virtual_span_day",
      "virtual_span_day",
      "virtual_span_day",
    ]);
    expect(windows[1]?.slice.sliceKey).toBe("2026-07-02");
    expect(windows[0]?.startAt).toBe("2026-07-01T12:00:00.000Z");
  });

  it("does not add an extra day when local end-of-day crosses UTC midnight (NY)", () => {
    // Jul 20 23:59:59.999 EDT → 2026-07-21T03:59:59.999Z
    const startAt = "2026-07-17T04:00:00.000Z"; // Jul 17 00:00 EDT
    const endAt = "2026-07-21T03:59:59.999Z";
    expect(expandAllDayDateKeys(startAt, endAt, "America/New_York")).toEqual([
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
      "2026-07-20",
    ]);
  });

  it("uses noon-UTC bounds so NY local date is a single day", () => {
    const { startAt, endAt } = allDayBoundsForDateKey("2026-07-18");
    expect(startAt).toBe("2026-07-18T12:00:00.000Z");
    expect(endAt).toBe("2026-07-18T12:00:00.000Z");
  });

  it("tags recurrence children as recurrence_occurrence", () => {
    const windows = buildScheduleWindows(
      { ...baseRow, id: "child-1", parentProposalId: "series-root" },
      [],
      { startAt: "2026-07-05T18:00:00.000Z", endAt: "2026-07-05T20:00:00.000Z" },
    );
    expect(windows[0]?.slice).toMatchObject({
      sliceKind: "recurrence_occurrence",
      rootProposalId: "series-root",
      occurrenceProposalId: "child-1",
      sliceKey: "child-1",
    });
  });

  it("omits detached slots", () => {
    const windows = buildScheduleWindows(
      { ...baseRow, isBatchSleeping: true },
      [
        {
          id: "slot-detached",
          startAt: "2026-07-01T00:00:00.000Z",
          endAt: null,
          label: null,
          isDetached: true,
        },
      ],
      null,
    );
    expect(windows).toHaveLength(0);
  });
});
