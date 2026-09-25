import type { ScheduleEvent } from "@/actions/schedule";
import { isSleepingLikeType } from "@/lib/proposals/sleeping-like";
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

export interface DayBarRender {
  key: string;
  event: ScheduleEvent;
  variant: ScheduleBlockVariant;
  lane: number;
}

export interface DayTimedRender {
  key: string;
  event: ScheduleEvent;
  variant: ScheduleBlockVariant;
}

export interface DayCellLayout {
  dayIndex: number;
  /** Sleeping, single-day all-day, and other multi-day bars, already lane-assigned. */
  bars: DayBarRender[];
  /** Timed events for this day, earliest start first. */
  timed: DayTimedRender[];
}

export interface MonthWeekLayout {
  weekIndex: number;
  days: DayCellLayout[];
  spanSegments: WeekSpanSegment[];
  laneCount: number;
}

export interface MonthViewLayout {
  weeks: MonthWeekLayout[];
}

/**
 * Vertical order in a month cell and in the overflow flyout.
 * 0 sleeping (including one night), 1 single-day all-day, 2 other multi-day, 3 timed.
 */
export function monthLineTier(event: ScheduleEvent, timeZone: string): 0 | 1 | 2 | 3 {
  if (isSleepingLikeType(event.proposalType)) return 0;
  if (event.isAllDay && !isMultiDayMonthSpan(event, timeZone)) return 1;
  if (isMultiDayMonthSpan(event, timeZone)) return 2;
  return 3;
}

/** True when the event is a bar rather than a timed line. */
export function isMonthBarEvent(event: ScheduleEvent, timeZone: string): boolean {
  return monthLineTier(event, timeZone) < 3;
}

/** True when the event should render as a multi-column span in month view. */
export function isMultiDayMonthSpan(event: ScheduleEvent, timeZone: string): boolean {
  if (isSleepingLikeType(event.proposalType)) {
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
 * Merges consecutive virtual_span_day windows for the same proposal into one display event
 * so month view shows a continuous bar (week-split only), not N false 2-day fragments (PC-258).
 */
export function mergeVirtualSpanDayEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  const groups = new Map<string, ScheduleEvent[]>();
  const others: ScheduleEvent[] = [];

  for (const event of events) {
    if (event.sliceKind !== "virtual_span_day") {
      others.push(event);
      continue;
    }
    const list = groups.get(event.rootProposalId) ?? [];
    list.push(event);
    groups.set(event.rootProposalId, list);
  }

  const merged: ScheduleEvent[] = [];
  for (const [, list] of groups) {
    const sorted = [...list].sort((a, b) => a.sliceKey.localeCompare(b.sliceKey));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    merged.push({
      ...first,
      id: `${first.rootProposalId}:month-span`,
      startAt: `${first.sliceKey}T12:00:00.000Z`,
      endAt: `${last.sliceKey}T12:00:00.000Z`,
      sliceKey: first.sliceKey,
    });
  }

  return [...others, ...merged];
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
    priority: monthLineTier(event, timeZone),
    variant: scheduleBlockVariant({
      state: event.state,
      proposalType: event.proposalType,
      isContentMasked: event.isContentMasked,
      hasOverlap: event.hasOverlap,
      atRisk: event.atRisk,
      isPartnerOnlySleeping: event.isPartnerOnlySleeping,
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
  maxLanes: number | null,
): { placed: WeekSpanSegment[]; overflow: RawWeekSegment[] } {
  const sorted = [...segments].sort((a, b) => {
    if (a.span.priority !== b.span.priority) return a.span.priority - b.span.priority;
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return b.endCol - b.startCol - (a.endCol - a.startCol);
  });

  const placed: WeekSpanSegment[] = [];
  const overflow: RawWeekSegment[] = [];
  const lanes: RawWeekSegment[][] = Array.from({ length: maxLanes ?? 0 }, () => []);

  for (const segment of sorted) {
    let lane = -1;
    for (let index = 0; index < lanes.length; index += 1) {
      const conflicts = lanes[index]!.some((existing) => segmentsOverlap(existing, segment));
      if (!conflicts) {
        lane = index;
        break;
      }
    }

    if (lane < 0) {
      if (maxLanes != null && lanes.length >= maxLanes) {
        overflow.push(segment);
        continue;
      }
      lane = lanes.length;
      lanes.push([]);
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

/**
 * Builds the month layout: week-split bars (sleeping, all-day, multi-day) and per-day timed lines.
 * Merges virtual_span_day slices of the same proposal into one continuous bar (PC-258).
 * The view decides how many lines fit; this function places every bar on a lane.
 */
export function buildMonthLayout(
  grid: Date[],
  events: ScheduleEvent[],
  timeZone: string,
): MonthViewLayout {
  const spans: MonthEventSpan[] = [];
  const seen = new Set<string>();

  for (const event of mergeVirtualSpanDayEvents(events)) {
    const span = monthEventSpan(grid, event, timeZone);
    if (!span) continue;
    const dedupeKey = `${event.id}:${span.startIndex}:${span.endIndex}:${span.displayMode}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    spans.push(span);
  }

  const weekCount = Math.ceil(grid.length / 7);
  const spanSegmentsByWeek = new Map<number, WeekSpanSegment[]>();
  const barsByDay = new Map<number, DayBarRender[]>();
  const timedByDay = new Map<number, DayTimedRender[]>();

  for (let dayIndex = 0; dayIndex < grid.length; dayIndex += 1) {
    barsByDay.set(dayIndex, []);
    timedByDay.set(dayIndex, []);
  }

  const barItems = spans.filter((span) => isMonthBarEvent(span.event, timeZone));
  const timedItems = spans.filter((span) => !isMonthBarEvent(span.event, timeZone));

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const rawSegments = barItems.flatMap((span) =>
      splitSpanAtWeekBoundaries(span).filter((segment) => segment.weekIndex === weekIndex),
    );
    const { placed } = assignSpanLanes(rawSegments, null);
    spanSegmentsByWeek.set(weekIndex, placed);

    for (const segment of placed) {
      for (let col = segment.startCol; col < segment.endCol; col += 1) {
        const dayIndex = weekIndex * 7 + (col - 1);
        barsByDay.get(dayIndex)!.push({
          key: `${segment.key}:d${dayIndex}`,
          event: segment.event,
          variant: segment.variant,
          lane: segment.lane,
        });
      }
    }
  }

  for (const span of timedItems) {
    const dayIndex = span.startIndex;
    timedByDay.get(dayIndex)!.push({
      key: `${span.event.id}:d${dayIndex}`,
      event: span.event,
      variant: span.variant,
    });
  }

  const weeks: MonthWeekLayout[] = [];

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const days: DayCellLayout[] = [];

    for (let col = 0; col < 7; col += 1) {
      const dayIndex = weekIndex * 7 + col;
      const timed = [...(timedByDay.get(dayIndex) ?? [])].sort((a, b) =>
        a.event.startAt.localeCompare(b.event.startAt),
      );
      days.push({
        dayIndex,
        bars: barsByDay.get(dayIndex) ?? [],
        timed,
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

  return { weeks };
}

export interface MonthPackDayInput {
  bars: { lane: number }[];
  timedCount: number;
}

/**
 * How many timed lines fit under the reserved bar lanes, and how many events the more-link covers.
 * When anything is hidden, the last line is reserved for the more-link.
 */
export function packMonthDay(options: {
  bars: { lane: number }[];
  timedCount: number;
  maxLines: number;
  visibleBarLanes: number;
}): { visibleTimedCount: number; hiddenCount: number } {
  const hiddenBars = options.bars.filter((bar) => bar.lane >= options.visibleBarLanes).length;
  const room = Math.max(0, options.maxLines - options.visibleBarLanes);
  if (hiddenBars === 0 && options.timedCount <= room) {
    return { visibleTimedCount: options.timedCount, hiddenCount: 0 };
  }
  const timedSlots = Math.max(0, room - 1);
  const visibleTimedCount = Math.min(options.timedCount, timedSlots);
  return {
    visibleTimedCount,
    hiddenCount: hiddenBars + options.timedCount - visibleTimedCount,
  };
}

/**
 * Largest bar-lane count that keeps spans aligned. Timed overflow still keeps those lanes
 * when one row remains for the more-link.
 */
export function chooseVisibleBarLanes(
  barLaneCount: number,
  maxLines: number,
  days: MonthPackDayInput[],
): number {
  if (maxLines <= 0 || barLaneCount <= 0) return 0;
  const upper = Math.min(barLaneCount, maxLines);
  for (let lanes = upper; lanes >= 0; lanes -= 1) {
    const overflows = days.some(
      (day) =>
        packMonthDay({
          bars: day.bars,
          timedCount: day.timedCount,
          maxLines,
          visibleBarLanes: lanes,
        }).hiddenCount > 0,
    );
    if (!overflows) return lanes;
    if (lanes <= maxLines - 1) return lanes;
  }
  return 0;
}
