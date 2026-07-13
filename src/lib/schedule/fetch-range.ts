import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";

import { addDays, endOfWeekSunday, startOfWeekMonday } from "@/lib/schedule/dates";
import { monthGridRange, startOfMonth } from "@/lib/schedule/month-grid";

export interface ScheduleFetchRange {
  rangeStart: Date;
  rangeEnd: Date;
}

/**
 * Computes the inclusive API fetch window for day, week, or month layouts (PC-77 / PC-204).
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

  if (layout === "day") {
    const rangeStart = new Date(anchorDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setHours(23, 59, 59, 999);
    return { rangeStart, rangeEnd };
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
