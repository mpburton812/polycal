import { describe, expect, it } from "vitest";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  buildMonthLayout,
  isMultiDayMonthSpan,
  splitSpanAtWeekBoundaries,
} from "./month-layout";
import { buildMonthGrid } from "./month-grid";
import { sleepingDateToStartIso } from "../proposals/sleeping-schedule";

function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: "evt-1",
    proposalId: "prop-1",
    title: "Test event",
    startAt: "2099-07-05T18:00:00.000Z",
    endAt: "2099-07-05T20:00:00.000Z",
    proposalType: "event",
    state: "resolved",
    proposerId: "u1",
    proposerName: "User",
    locationName: null,
    participantIds: ["u1"],
    participantNames: ["User"],
    intentionalSolo: false,
    isContentMasked: false,
    isTentative: false,
    atRisk: false,
    hasOverlap: false,
    isPoll: false,
    isAllDay: false,
    slotLabel: null,
    sliceKind: "standalone",
    rootProposalId: "prop-1",
    sliceKey: "prop-1",
    slotId: null,
    occurrenceProposalId: null,
    eventIconKey: null,
    isPartnerOnlySleeping: false,
    ...overrides,
  };
}

describe("isMultiDayMonthSpan", () => {
  it("treats timed events as single-day in month view", () => {
    const event = makeEvent({
      startAt: "2099-07-05T23:00:00.000Z",
      endAt: "2099-07-06T01:00:00.000Z",
    });
    expect(isMultiDayMonthSpan(event, "UTC")).toBe(false);
  });

  it("treats all-day multi-day events as spanning", () => {
    const event = makeEvent({
      isAllDay: true,
      startAt: sleepingDateToStartIso("2099-07-05")!,
      endAt: sleepingDateToStartIso("2099-07-07")!,
    });
    expect(isMultiDayMonthSpan(event, "UTC")).toBe(true);
  });

  it("treats single-night sleeping as single-day", () => {
    const event = makeEvent({
      proposalType: "sleeping",
      startAt: sleepingDateToStartIso("2099-07-05")!,
      endAt: null,
    });
    expect(isMultiDayMonthSpan(event, "UTC")).toBe(false);
  });
});

describe("splitSpanAtWeekBoundaries", () => {
  it("splits spans that cross a Sunday/Monday week boundary", () => {
    const segments = splitSpanAtWeekBoundaries({
      event: makeEvent(),
      startIndex: 5,
      endIndex: 8,
      displayMode: "span",
      priority: 4,
      variant: "resolved_event",
    });
    expect(segments).toHaveLength(2);
    expect(segments[0]!.endCol).toBe(8);
    expect(segments[1]!.startCol).toBe(1);
    for (const segment of segments) {
      expect(segment.startCol).toBeLessThan(segment.endCol);
    }
  });
});

describe("buildMonthLayout", () => {
  it("places timed events as single-day chips without spanning columns", () => {
    const grid = buildMonthGrid(new Date(2099, 6, 1));
    const start = new Date(2099, 6, 14, 18, 0, 0, 0).toISOString();
    const end = new Date(2099, 6, 14, 20, 0, 0, 0).toISOString();
    const layout = buildMonthLayout(
      grid,
      [makeEvent({ id: "e1", startAt: start, endAt: end, title: "Volleyball" })],
      "UTC",
      3,
    );
    const totalSpans = layout.weeks.reduce((sum, week) => sum + week.spanSegments.length, 0);
    expect(totalSpans).toBe(0);
    const chips = layout.weeks.flatMap((week) => week.days.flatMap((day) => day.chips));
    expect(chips.length).toBe(1);
  });

  it("assigns archived variant through layout", () => {
    const grid = buildMonthGrid(new Date(2099, 6, 1));
    const start = sleepingDateToStartIso("2099-07-10")!;
    const layout = buildMonthLayout(
      grid,
      [
        makeEvent({
          id: "arch",
          state: "archived",
          isAllDay: true,
          startAt: start,
          endAt: null,
          title: "Past event",
        }),
      ],
      "UTC",
      3,
    );
    const chip = layout.weeks.flatMap((week) => week.days.flatMap((day) => day.chips))[0];
    expect(chip?.variant).toBe("archived");
  });

  it("merges virtual_span_day windows into one continuous NY month bar (PC-258)", () => {
    const grid = buildMonthGrid(new Date(2026, 6, 1));
    const tz = "America/New_York";
    const days = ["2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20"];
    const events = days.map((dateKey) =>
      makeEvent({
        id: `prop-trip:${dateKey}`,
        proposalId: "prop-trip",
        rootProposalId: "prop-trip",
        title: "Cool Kids Pittsburgh Trip",
        isAllDay: true,
        state: "proposed",
        startAt: `${dateKey}T00:00:00.000Z`,
        endAt: `${dateKey}T23:59:59.999Z`,
        sliceKind: "virtual_span_day",
        sliceKey: dateKey,
      }),
    );

    const layout = buildMonthLayout(grid, events, tz, 3);
    const titled = layout.weeks.flatMap((week) =>
      week.spanSegments.filter((segment) => segment.showTitle),
    );
    expect(titled).toHaveLength(1);
    expect(titled[0]!.event.title).toBe("Cool Kids Pittsburgh Trip");

    const allSegments = layout.weeks.flatMap((week) => week.spanSegments);
    // Week-row split only: Fri–Sun then Mon — not N overlapping 2-day bars.
    expect(allSegments.length).toBe(2);
    expect(allSegments.every((s) => s.event.rootProposalId === "prop-trip")).toBe(true);
  });
});
