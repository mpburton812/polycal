import type { ScheduleEvent } from "@/actions/schedule";
import { scheduleBlockVariant, type ScheduleBlockVariant } from "@/lib/schedule/colors";
import { localDateKey } from "@/lib/schedule/dates";
import { eventSpanInGrid } from "@/lib/schedule/month-grid";

export type MonthDisplayMode = "single" | "span";

export interface MonthEventSpan {
  event: ScheduleEvent;
  startIndex: number;
  endIndex: number;
  displayMode: MonthDisplayMode;
  priority: number;
  variant: ScheduleBlockVariant;
}

export interface WeekSpanSegment {
  key: string;
  event: ScheduleEvent;
  weekIndex: number;
  lane: number;
  startCol: number;
  endCol: number;
  isStartSegment: boolean;
  isEndSegment: boolean;
  variant: ScheduleBlockVariant;
  showTitle: boolean;
}

export interface DayChipRender {
  key: string;
  event: ScheduleEvent;
  variant: ScheduleBlockVariant;
}

export interface DayCellLayout {
  dayIndex: number;
  chips: DayChipRender[];
  hiddenCount: number;
  stateDots: ScheduleBlockVariant[];
}

export interface MonthWeekLayout {
  weekIndex: number;
  days: DayCellLayout[];
  spanSegments: WeekSpanSegment[];
  laneCount: number;
}

export interface MonthViewLayout {
  weeks: MonthWeekLayout[];
  maxSpanLanes: number;
  maxChipsPerDay: number;
}

const MAX_CHIPS_PER_DAY = 2;

/**
 * Lower priority number = shown first when space is limited.
 */
export function eventDisplayPriority(event: ScheduleEvent): number {
  if (event.hasOverlap) return 0;
  if (event.atRisk) return 1;
  if (event.state === "proposed") return 2;
  if (event.proposalType === "sleeping") return 3;
  if (event.state === "resolved") return 4;
  return 5;
}

/** True when the event should render as a multi-column span in month view. */
export function isMultiDayMonthSpan(event: ScheduleEvent, timeZone: string): boolean {
  if (event.proposalType === "sleeping") {
    if (!event.endAt) return false;
    return localDateKey(event.startAt, timeZone) !== localDateKey(event.endAt, timeZone);
  }
  if (event.isAllDay) {
    if (!event.endAt) return false;
    return localDateKey(event.startAt, timeZone) !== localDateKey(event.endAt, timeZone);
  }
  return false;
}

/**
 * Resolves grid span and display mode for one schedule event.
 */
export function monthEventSpan(
  grid: Date[],
  event: ScheduleEvent,
  timeZone: string,
): MonthEventSpan | null {
  const multiDay = isMultiDayMonthSpan(event, timeZone);
  const span = eventSpanInGrid(
    grid,
    event.startAt,
    multiDay ? event.endAt : null,
    timeZone,
  );
  if (!span) return null;

  const endIndex = multiDay ? span.endIndex : span.startIndex;
  return {
    event,
    startIndex: span.startIndex,
    endIndex,
    displayMode: multiDay ? "span" : "single",
    priority: eventDisplayPriority(event),
    variant: scheduleBlockVariant({
      state: event.state,
      proposalType: event.proposalType,
      isContentMasked: event.isContentMasked,
      hasOverlap: event.hasOverlap,
      atRisk: event.atRisk,
    }),
  };
}

interface RawWeekSegment {
  span: MonthEventSpan;
  weekIndex: number;
  startCol: number;
  endCol: number;
  isStartSegment: boolean;
  isEndSegment: boolean;
}

/** Splits a multi-day span into one segment per calendar week row. */
export function splitSpanAtWeekBoundaries(span: MonthEventSpan): RawWeekSegment[] {
  const segments: RawWeekSegment[] = [];
  let cursor = span.startIndex;

  while (cursor <= span.endIndex) {
    const weekIndex = Math.floor(cursor / 7);
    const weekEndIndex = weekIndex * 7 + 6;
    const segEnd = Math.min(span.endIndex, weekEndIndex);

    segments.push({
      span,
      weekIndex,
      startCol: (cursor % 7) + 1,
      endCol: (segEnd % 7) + 2,
      isStartSegment: cursor === span.startIndex,
      isEndSegment: segEnd === span.endIndex,
    });

    cursor = segEnd + 1;
  }

  return segments;
}

function segmentsOverlap(a: RawWeekSegment, b: RawWeekSegment): boolean {
  return a.startCol < b.endCol && b.startCol < a.endCol;
}

function assignSpanLanes(
  segments: RawWeekSegment[],
  maxLanes: number,
): { placed: WeekSpanSegment[]; overflow: RawWeekSegment[] } {
  const sorted = [...segments].sort((a, b) => {
    if (a.span.priority !== b.span.priority) return a.span.priority - b.span.priority;
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return b.endCol - b.startCol - (a.endCol - a.startCol);
  });

  const placed: WeekSpanSegment[] = [];
  const overflow: RawWeekSegment[] = [];
  const lanes: RawWeekSegment[][] = Array.from({ length: maxLanes }, () => []);

  for (const segment of sorted) {
    let lane = -1;
    for (let index = 0; index < maxLanes; index += 1) {
      const conflicts = lanes[index]!.some((existing) => segmentsOverlap(existing, segment));
      if (!conflicts) {
        lane = index;
        break;
      }
    }

    if (lane < 0) {
      overflow.push(segment);
      continue;
    }

    lanes[lane]!.push(segment);
    placed.push({
      key: `${segment.span.event.id}:w${segment.weekIndex}:l${lane}:${segment.startCol}`,
      event: segment.span.event,
      weekIndex: segment.weekIndex,
      lane,
      startCol: segment.startCol,
      endCol: segment.endCol,
      isStartSegment: segment.isStartSegment,
      isEndSegment: segment.isEndSegment,
      variant: segment.span.variant,
      showTitle: segment.isStartSegment,
    });
  }

  return { placed, overflow };
}

function variantForEvent(event: ScheduleEvent): ScheduleBlockVariant {
  return scheduleBlockVariant({
    state: event.state,
    proposalType: event.proposalType,
    isContentMasked: event.isContentMasked,
    hasOverlap: event.hasOverlap,
    atRisk: event.atRisk,
  });
}

/**
 * Builds Outlook-style month layout: week-split spans, stacked lanes, per-day chips.
 */
export function buildMonthLayout(
  grid: Date[],
  events: ScheduleEvent[],
  timeZone: string,
  maxSpanLanes: number,
): MonthViewLayout {
  const spans: MonthEventSpan[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const span = monthEventSpan(grid, event, timeZone);
    if (!span) continue;
    const dedupeKey = `${event.id}:${span.startIndex}:${span.endIndex}:${span.displayMode}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    spans.push(span);
  }

  const weekCount = Math.ceil(grid.length / 7);
  const spanSegmentsByWeek = new Map<number, WeekSpanSegment[]>();
  const spanOverflowByDay = new Map<number, number>();
  const eventsByDay = new Map<number, ScheduleEvent[]>();

  for (let dayIndex = 0; dayIndex < grid.length; dayIndex += 1) {
    eventsByDay.set(dayIndex, []);
  }

  const spanItems = spans.filter((span) => span.displayMode === "span");
  const singleItems = spans.filter((span) => span.displayMode === "single");

  for (const span of spanItems) {
    for (let dayIndex = span.startIndex; dayIndex <= span.endIndex; dayIndex += 1) {
      eventsByDay.get(dayIndex)!.push(span.event);
    }
  }

  for (const span of singleItems) {
    eventsByDay.get(span.startIndex)!.push(span.event);
  }

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const rawSegments = spanItems.flatMap((span) =>
      splitSpanAtWeekBoundaries(span).filter((segment) => segment.weekIndex === weekIndex),
    );
    const { placed, overflow } = assignSpanLanes(rawSegments, maxSpanLanes);
    spanSegmentsByWeek.set(weekIndex, placed);

    for (const segment of overflow) {
      for (let col = segment.startCol; col < segment.endCol; col += 1) {
        const dayIndex = weekIndex * 7 + (col - 1);
        spanOverflowByDay.set(dayIndex, (spanOverflowByDay.get(dayIndex) ?? 0) + 1);
      }
    }
  }

  const weeks: MonthWeekLayout[] = [];

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const days: DayCellLayout[] = [];

    for (let col = 0; col < 7; col += 1) {
      const dayIndex = weekIndex * 7 + col;
      const dayEvents = eventsByDay.get(dayIndex) ?? [];

      const singleDayEvents = singleItems
        .filter((span) => span.startIndex === dayIndex)
        .map((span) => span.event);

      const sortedSingles = [...singleDayEvents].sort(
        (a, b) => eventDisplayPriority(a) - eventDisplayPriority(b),
      );
      const visibleSingles = sortedSingles.slice(0, MAX_CHIPS_PER_DAY);
      const hiddenSingles = sortedSingles.length - visibleSingles.length;
      const spanHidden = spanOverflowByDay.get(dayIndex) ?? 0;

      const chips: DayChipRender[] = visibleSingles.map((event) => ({
        key: `${event.id}:d${dayIndex}`,
        event,
        variant: variantForEvent(event),
      }));

      const allVariants = [...new Set(dayEvents.map((event) => variantForEvent(event)))].slice(
        0,
        4,
      );

      days.push({
        dayIndex,
        chips,
        hiddenCount: hiddenSingles + spanHidden,
        stateDots: allVariants,
      });
    }

    const spanSegments = spanSegmentsByWeek.get(weekIndex) ?? [];
    const laneCount = spanSegments.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);

    weeks.push({
      weekIndex,
      days,
      spanSegments,
      laneCount,
    });
  }

  return {
    weeks,
    maxSpanLanes: maxSpanLanes,
    maxChipsPerDay: MAX_CHIPS_PER_DAY,
  };
}
