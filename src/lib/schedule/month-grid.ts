import { addDays, localDateKey, startOfWeekMonday } from "./dates";

/** First calendar day of the month containing `date`. */
export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Last instant of the month containing `date`. */
export function endOfMonth(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return result;
}

/** Monday-aligned 6-week grid covering the month (42 cells). */
export function buildMonthGrid(monthAnchor: Date): Date[] {
  const monthStart = startOfMonth(monthAnchor);
  const gridStart = startOfWeekMonday(monthStart);
  const monthEnd = endOfMonth(monthAnchor);

  const days: Date[] = [];
  let cursor = gridStart;
  while (days.length < 42) {
    days.push(new Date(cursor));
    cursor = addDays(cursor, 1);
    if (days.length >= 35 && cursor > monthEnd && cursor.getDay() === 1) break;
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
