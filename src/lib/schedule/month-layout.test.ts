import { describe, expect, it } from "vitest";

import type { ScheduleEvent } from "@/actions/schedule";
import {
  buildMonthLayout,
  chooseVisibleBarLanes,
  isMultiDayMonthSpan,
  monthLineTier,
  packMonthDay,
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
  it("splits spans that cross a Saturday/Sunday week boundary", () => {
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
  it("places timed events as single-day lines without spanning columns", () => {
    const grid = buildMonthGrid(new Date("2099-07-15T12:00:00.000Z"), "UTC");
    const layout = buildMonthLayout(grid, [
      makeEvent({
        id: "e1",
        startAt: "2099-07-14T18:00:00.000Z",
        endAt: "2099-07-14T20:00:00.000Z",
        title: "Volleyball",
      }),
    ], "UTC");
    const totalSpans = layout.weeks.reduce((sum, week) => sum + week.spanSegments.length, 0);
    expect(totalSpans).toBe(0);
    const timed = layout.weeks.flatMap((week) => week.days.flatMap((day) => day.timed));
    expect(timed).toHaveLength(1);
  });

  it("assigns archived variant to a single-day all-day bar", () => {
    const grid = buildMonthGrid(new Date("2099-07-15T12:00:00.000Z"), "UTC");
    const start = sleepingDateToStartIso("2099-07-10")!;
    const layout = buildMonthLayout(grid, [
      makeEvent({
        id: "arch",
        state: "archived",
        isAllDay: true,
        startAt: start,
        endAt: null,
        title: "Past event",
      }),
    ], "UTC");
    const bar = layout.weeks.flatMap((week) => week.days.flatMap((day) => day.bars))[0];
    expect(bar?.variant).toBe("archived");
    expect(bar?.lane).toBe(0);
  });

  it("stacks a one-day sleep above a single all-day event, then a multi-day event, then a timed event", () => {
    const grid = buildMonthGrid(new Date("2099-07-15T12:00:00.000Z"), "UTC");
    const day = "2099-07-14";
    const layout = buildMonthLayout(
      grid,
      [
        makeEvent({
          id: "timed",
          startAt: `${day}T15:00:00.000Z`,
          endAt: `${day}T16:00:00.000Z`,
          title: "Timed",
        }),
        makeEvent({
          id: "multi",
          isAllDay: true,
          startAt: sleepingDateToStartIso(day)!,
          endAt: sleepingDateToStartIso("2099-07-16")!,
          title: "Multi",
        }),
        makeEvent({
          id: "allday",
          isAllDay: true,
          startAt: sleepingDateToStartIso(day)!,
          endAt: null,
          title: "All day",
        }),
        makeEvent({
          id: "sleep",
          proposalType: "sleeping",
          startAt: sleepingDateToStartIso(day)!,
          endAt: null,
          title: "Sleep",
        }),
      ],
      "UTC",
    );
    const cell = layout.weeks.flatMap((week) => week.days).find((item) =>
      item.bars.some((bar) => bar.event.id === "sleep") &&
      item.timed.some((line) => line.event.id === "timed"),
    );
    expect(cell).toBeTruthy();
    const lanes = Object.fromEntries(cell!.bars.map((bar) => [bar.event.id, bar.lane]));
    expect(lanes.sleep).toBeLessThan(lanes.allday);
    expect(lanes.allday).toBeLessThan(lanes.multi);
    expect(monthLineTier(cell!.timed[0]!.event, "UTC")).toBe(3);
  });

  it("hides timed lines before bars when the cell runs out of room", () => {
    const bars = [{ lane: 0 }, { lane: 1 }];
    const fitting = packMonthDay({ bars, timedCount: 1, maxLines: 4, visibleBarLanes: 2 });
    expect(fitting).toEqual({ visibleTimedCount: 1, hiddenCount: 0 });

    const overflowing = packMonthDay({ bars, timedCount: 5, maxLines: 4, visibleBarLanes: 2 });
    expect(overflowing.visibleTimedCount).toBe(1);
    expect(overflowing.hiddenCount).toBe(4);

    const lanes = chooseVisibleBarLanes(2, 4, [{ bars, timedCount: 5 }]);
    expect(lanes).toBe(2);
  });

  it("merges virtual_span_day windows into one continuous NY month bar (PC-258)", () => {
    const grid = buildMonthGrid(new Date("2026-07-15T12:00:00.000Z"), "America/New_York");
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
        startAt: `${dateKey}T12:00:00.000Z`,
        endAt: `${dateKey}T12:00:00.000Z`,
        sliceKind: "virtual_span_day",
        sliceKey: dateKey,
      }),
    );

    const layout = buildMonthLayout(grid, events, tz);
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
