import {
  addDays,
  civilDateAtNoonUtc,
  endOfCivilDayInZone,
  localDateKey,
  startOfCivilDayInZone,
  startOfWeekMonday,
} from "./dates";
import { DEFAULT_VIEWER_TIMEZONE } from "./timezone";

/** First civil day (noon-UTC) of the month containing `date` in `timeZone` (PC-376). */
export function startOfMonth(
  date: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const key = localDateKey(date.toISOString(), timeZone);
  return civilDateAtNoonUtc(`${key.slice(0, 8)}01`);
}

/** Last instant of the month containing `date` in `timeZone` (PC-376). */
export function endOfMonth(
  date: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const start = startOfMonth(date, timeZone);
  const nextMonth = new Date(start);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return new Date(nextMonth.getTime() - 1);
}

/** Monday-aligned 6-week grid covering the month (42 cells). */
export function buildMonthGrid(
  monthAnchor: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date[] {
  const monthStart = startOfMonth(monthAnchor, timeZone);
  const gridStart = startOfWeekMonday(monthStart, timeZone);
  const monthEnd = endOfMonth(monthAnchor, timeZone);

  const days: Date[] = [];
  let cursor = gridStart;
  while (days.length < 42) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
    const cursorKey = localDateKey(cursor.toISOString(), timeZone);
    const endKey = localDateKey(monthEnd.toISOString(), timeZone);
    const cursorWeekday = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    }).format(cursor);
    if (days.length >= 35 && cursorKey > endKey && cursorWeekday === "Mon") break;
  }
  while (days.length < 42) {
    days.push(addDays(days[days.length - 1]!, 1));
  }
  return days;
}

/** Inclusive day index for an ISO timestamp within a month grid, or -1. */
export function dayIndexInGrid(grid: Date[], iso: string, timeZone: string): number {
  const key = localDateKey(iso, timeZone);
  return grid.findIndex((day) => localDateKey(day.toISOString(), timeZone) === key);
}

/**
 * Visible fetch range for the 42-cell month grid (includes leading/trailing padding days).
 * Uses viewer-TZ midnight→EOD — noon-UTC cell anchors clipped afternoon events on the
 * last overflow day (e.g. Sept 6 10:00 ET when August’s grid ends that Sunday) (PC-411).
 */
export function monthGridRange(
  monthAnchor: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): { rangeStart: Date; rangeEnd: Date } {
  const grid = buildMonthGrid(monthAnchor, timeZone);
  const startKey = localDateKey(grid[0]!.toISOString(), timeZone);
  const endKey = localDateKey(grid[grid.length - 1]!.toISOString(), timeZone);
  return {
    rangeStart: startOfCivilDayInZone(startKey, timeZone),
    rangeEnd: endOfCivilDayInZone(endKey, timeZone),
  };
}

/** Inclusive [startIndex, endIndex] span for a schedule block within the grid. */
export function eventSpanInGrid(
  grid: Date[],
  startAt: string,
  endAt: string | null,
  timeZone: string,
): { startIndex: number; endIndex: number } | null {
  const startIndex = dayIndexInGrid(grid, startAt, timeZone);
  if (startIndex < 0) return null;

  const endIso = endAt ?? startAt;
  let endIndex = dayIndexInGrid(grid, endIso, timeZone);
  if (endIndex < 0) endIndex = startIndex;
  if (endIndex < startIndex) endIndex = startIndex;

  return { startIndex, endIndex };
}
