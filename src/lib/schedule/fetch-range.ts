import type { ScheduleCalendarLayout } from "@/components/schedule/scheduleViewState";

import { addDays, endOfCivilDayInZone, localDateKey, startOfCivilDayInZone, startOfWeekSunday } from "@/lib/schedule/dates";
import { monthGridRange, startOfMonth } from "@/lib/schedule/month-grid";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

export interface ScheduleFetchRange {
  rangeStart: Date;
  rangeEnd: Date;
}

/**
 * Computes the inclusive API fetch window for day, week, or month layouts (PC-77 / PC-204 / PC-376 / PC-488 / PC-494).
 * Week bounds use viewer-TZ midnight→EOD so Sunday morning events are not clipped by noon anchors.
 */
export function computeScheduleFetchRange(
  anchorDate: Date,
  layout: ScheduleCalendarLayout,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ScheduleFetchRange {
  if (layout === "month") {
    const monthRange = monthGridRange(startOfMonth(anchorDate, timeZone), timeZone);
    return { rangeStart: monthRange.rangeStart, rangeEnd: monthRange.rangeEnd };
  }

  if (layout === "day") {
    // Civil midnight→EOD in the viewer timezone. Browser setHours(0) shifts
    // tonight's sleeping night off the day when the host clock differs (PC-530).
    const dayKey = localDateKey(anchorDate.toISOString(), timeZone);
    return {
      rangeStart: startOfCivilDayInZone(dayKey, timeZone),
      rangeEnd: endOfCivilDayInZone(dayKey, timeZone),
    };
  }

  const sundayNoon = startOfWeekSunday(anchorDate, timeZone);
  const sundayKey = localDateKey(sundayNoon.toISOString(), timeZone);
  const rangeStart = startOfCivilDayInZone(sundayKey, timeZone);
  const endNoon = addDays(sundayNoon, 6);
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
