import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";
import type { ScheduleEvent } from "@/actions/schedule";
import {
  addDays,
  civilDateAtNoonUtc,
  localDateKey,
  startOfWeekMonday,
} from "@/lib/schedule/dates";
import { computeScheduleFetchRange, type ScheduleFetchRange } from "@/lib/schedule/fetch-range";
import { startOfMonth } from "@/lib/schedule/month-grid";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

/** Default soft cap when layout is unknown (PC-489). */
export const SCHEDULE_MAX_SEGMENTS = 12;

/** Per-layout sliding-window caps for infinite scroll (PC-494). */
export const SCHEDULE_MAX_SEGMENTS_BY_LAYOUT: Record<ScheduleCalendarLayout, number> = {
  day: 21,
  week: 16,
  month: 12,
};

/**
 * Returns the segment stack cap for the active calendar layout (PC-494).
 */
export function scheduleMaxSegments(layout: ScheduleCalendarLayout): number {
  return SCHEDULE_MAX_SEGMENTS_BY_LAYOUT[layout] ?? SCHEDULE_MAX_SEGMENTS;
}

/** Max segments to prefetch while filling the first viewport (PC-489). */
export const SCHEDULE_VIEWPORT_FILL_MAX = 5;

export interface ScheduleSegment {
  /** Stable key — ISO of normalized segment anchor. */
  id: string;
  anchorIso: string;
  rangeStartIso: string;
  rangeEndIso: string;
  events: ScheduleEvent[];
}

/**
 * Normalizes an arbitrary date to the segment anchor for day / week / month (PC-489).
 */
export function normalizeSegmentAnchor(
  date: Date,
  layout: ScheduleCalendarLayout,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  if (layout === "month") return startOfMonth(date, timeZone);
  if (layout === "day") {
    const key = localDateKey(date.toISOString(), timeZone);
    return civilDateAtNoonUtc(key);
  }
  return startOfWeekMonday(date, timeZone);
}

/**
 * Steps the segment anchor by ±1 period (day / week / month) (PC-489).
 */
export function shiftSegmentAnchor(
  anchor: Date,
  layout: ScheduleCalendarLayout,
  delta: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const base = normalizeSegmentAnchor(anchor, layout, timeZone);
  if (layout === "month") {
    const next = new Date(base);
    next.setMonth(next.getMonth() + delta);
    return startOfMonth(next, timeZone);
  }
  if (layout === "day") {
    return normalizeSegmentAnchor(addDays(base, delta), layout, timeZone);
  }
  return normalizeSegmentAnchor(addDays(base, delta * 7), layout, timeZone);
}

/**
 * Fetch window for one segment (wraps computeScheduleFetchRange) (PC-489).
 */
export function segmentFetchRange(
  anchor: Date,
  layout: ScheduleCalendarLayout,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ScheduleFetchRange {
  return computeScheduleFetchRange(
    normalizeSegmentAnchor(anchor, layout, timeZone),
    layout,
    timeZone,
  );
}

/**
 * Builds a loaded segment record from an anchor + events (PC-489).
 */
export function buildScheduleSegment(
  anchor: Date,
  layout: ScheduleCalendarLayout,
  events: ScheduleEvent[],
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ScheduleSegment {
  const normalized = normalizeSegmentAnchor(anchor, layout, timeZone);
  const range = computeScheduleFetchRange(normalized, layout, timeZone);
  return {
    id: normalized.toISOString(),
    anchorIso: normalized.toISOString(),
    rangeStartIso: range.rangeStart.toISOString(),
    rangeEndIso: range.rangeEnd.toISOString(),
    events,
  };
}

/**
 * Merges events by id (server range padding can overlap adjacent segments) (PC-489).
 */
export function mergeScheduleEvents(
  existing: ScheduleEvent[],
  incoming: ScheduleEvent[],
): ScheduleEvent[] {
  const byId = new Map<string, ScheduleEvent>();
  for (const event of existing) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return Array.from(byId.values());
}

/**
 * Trims segment stack from the far edge when over the soft cap, preferring to keep `keepId` (PC-489).
 */
export function trimScheduleSegments(
  segments: ScheduleSegment[],
  direction: "past" | "future",
  max: number = SCHEDULE_MAX_SEGMENTS,
): ScheduleSegment[] {
  if (segments.length <= max) return segments;
  const overflow = segments.length - max;
  if (direction === "future") {
    // Drop oldest (past) when appending future.
    return segments.slice(overflow);
  }
  // Drop newest (future) when prepending past.
  return segments.slice(0, segments.length - overflow);
}
