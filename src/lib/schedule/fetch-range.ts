import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";

import { addDays, endOfWeekSunday, startOfWeekMonday } from "@/lib/schedule/dates";
import { monthGridRange, startOfMonth } from "@/lib/schedule/month-grid";

export interface ScheduleFetchRange {
  rangeStart: Date;
  rangeEnd: Date;
}

/**
 * Computes the inclusive API fetch window for week or month calendar layouts (PC-77).
 */
export function computeScheduleFetchRange(
  anchorDate: Date,
  layout: ScheduleCalendarLayout,
  compact: boolean,
): ScheduleFetchRange {
  if (layout === "month") {
    const monthRange = monthGridRange(startOfMonth(anchorDate));
    return { rangeStart: monthRange.rangeStart, rangeEnd: monthRange.rangeEnd };
  }

  const rangeStart = startOfWeekMonday(anchorDate);
  const rangeEnd = compact ? addDays(rangeStart, 13) : endOfWeekSunday(rangeStart);
  if (compact) {
    rangeEnd.setHours(23, 59, 59, 999);
  }
  return { rangeStart, rangeEnd };
}

/** Day count between two dates (inclusive of partial span). */
export function scheduleFetchRangeDayCount(range: ScheduleFetchRange): number {
  const ms = range.rangeEnd.getTime() - range.rangeStart.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
