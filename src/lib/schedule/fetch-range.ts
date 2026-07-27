import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";

import { addDays, endOfCivilDayInZone, localDateKey, startOfCivilDayInZone, startOfWeekMonday } from "@/lib/schedule/dates";
import { monthGridRange, startOfMonth } from "@/lib/schedule/month-grid";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

export interface ScheduleFetchRange {
  rangeStart: Date;
  rangeEnd: Date;
}

/**
 * Computes the inclusive API fetch window for day, week, or month layouts (PC-77 / PC-204 / PC-376).
 * Week bounds use viewer-TZ midnight→EOD so Monday morning events are not clipped by noon anchors.
 */
export function computeScheduleFetchRange(
  anchorDate: Date,
  layout: ScheduleCalendarLayout,
  compact: boolean,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ScheduleFetchRange {
  if (layout === "month") {
    const monthRange = monthGridRange(startOfMonth(anchorDate, timeZone), timeZone);
    return { rangeStart: monthRange.rangeStart, rangeEnd: monthRange.rangeEnd };
  }

  if (layout === "day") {
    // Local midnight→EOD around the anchor; day chrome uses noon-UTC civil anchors (PC-204).
    const rangeStart = new Date(anchorDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setHours(23, 59, 59, 999);
    return { rangeStart, rangeEnd };
  }

  const mondayNoon = startOfWeekMonday(anchorDate, timeZone);
  const mondayKey = localDateKey(mondayNoon.toISOString(), timeZone);
  const rangeStart = startOfCivilDayInZone(mondayKey, timeZone);
  const endNoon = addDays(mondayNoon, compact ? 13 : 6);
  const endKey = localDateKey(endNoon.toISOString(), timeZone);
  return {
    rangeStart,
    rangeEnd: endOfCivilDayInZone(endKey, timeZone),
  };
}

/** Day count between two dates (inclusive of partial span). */
export function scheduleFetchRangeDayCount(range: ScheduleFetchRange): number {
  const ms = range.rangeEnd.getTime() - range.rangeStart.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
