/** Monday-based week boundaries for the schedule tab (PC-42 / PC-376). */

import { GARDEN_TOKENS } from "@/theme/tokens";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

/** Civil yyyy-MM-dd → noon-UTC Date (stable across host timezones). */
export function civilDateAtNoonUtc(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return new Date(NaN);
  return new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`);
}

/** Weekday 0=Sun…6=Sat for an instant in `timeZone`. */
function weekdayInTimeZone(date: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? date.getUTCDay();
}

/**
 * Returns noon-UTC on the Monday (viewer TZ) that starts the week containing `date`.
 * Host-local midnight Mondays shift back a day when formatted in US zones (PC-376).
 */
export function startOfWeekMonday(
  date: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const dayKey = localDateKey(date.toISOString(), timeZone);
  const noon = civilDateAtNoonUtc(dayKey);
  const day = weekdayInTimeZone(noon, timeZone);
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(noon);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
}

/** True when two dates fall on the same local calendar day (PC-141). */
export function isSameLocalCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Inclusive range end at Sunday end-of-day in `timeZone` for a noon-UTC Monday anchor (PC-376).
 */
export function endOfWeekSunday(
  weekStart: Date,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const sundayNoon = addDays(weekStart, 6);
  const sundayKey = localDateKey(sundayNoon.toISOString(), timeZone);
  return endOfCivilDayInZone(sundayKey, timeZone);
}

/** Adds `days` on the UTC calendar (matches noon-UTC civil anchors). */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Builds a Mon-based day window then starts at today (chronological forward).
 * Past days in the window are dropped and replaced by days after the window end
 * so week / 2-week lists keep Today first without wrapping (PC-400).
 */
export function scheduleDaysStartingToday(
  weekStart: Date,
  dayCount: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
  now: Date = new Date(),
): Date[] {
  const monday = startOfWeekMonday(weekStart, timeZone);
  const days = Array.from({ length: dayCount }, (_, index) => addDays(monday, index));
  const todayKey = localDateKey(now.toISOString(), timeZone);
  const todayIndex = days.findIndex(
    (day) => localDateKey(day.toISOString(), timeZone) === todayKey,
  );
  if (todayIndex <= 0) return days;

  const fromToday = days.slice(todayIndex);
  const need = dayCount - fromToday.length;
  if (need <= 0) return fromToday.slice(0, dayCount);

  const last = days[days.length - 1]!;
  const extras = Array.from({ length: need }, (_, index) => addDays(last, index + 1));
  return [...fromToday, ...extras];
}

/**
 * Instant for wall-clock `hour:minute:second.ms` on civil `dateKey` in `timeZone` (PC-376).
 */
export function zonedWallTimeToUtc(
  dateKey: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return new Date(NaN);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayNum = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, dayNum, 12, 0, 0));
  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "numeric",
  }).formatToParts(probe);
  const tzName = offsetParts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offsetMatch = /GMT([+-])(\d+)(?::(\d+))?/.exec(tzName);
  let offsetMinutes = 0;
  if (offsetMatch) {
    const sign = offsetMatch[1] === "-" ? -1 : 1;
    offsetMinutes =
      sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3] ?? 0));
  }
  return new Date(
    Date.UTC(year, month - 1, dayNum, hour, minute, second, ms) - offsetMinutes * 60_000,
  );
}

/** Start of civil day (00:00:00.000) in `timeZone`. */
export function startOfCivilDayInZone(dateKey: string, timeZone: string): Date {
  return zonedWallTimeToUtc(dateKey, 0, 0, 0, 0, timeZone);
}

/** End of civil day (23:59:59.999) in `timeZone`. */
export function endOfCivilDayInZone(dateKey: string, timeZone: string): Date {
  return zonedWallTimeToUtc(dateKey, 23, 59, 59, 999, timeZone);
}

/** True when [aStart,aEnd] overlaps [bStart,bEnd] (open end uses start instant). */
export function intervalsOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
): boolean {
  const aEndMs = aEnd ? new Date(aEnd).getTime() : new Date(aStart).getTime();
  const bEndMs = bEnd ? new Date(bEnd).getTime() : new Date(bStart).getTime();
  const aStartMs = new Date(aStart).getTime();
  const bStartMs = new Date(bStart).getTime();
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

/** True when an event interval intersects a visible calendar range. */
export function eventInRange(
  startAt: string,
  endAt: string | null,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const eventEnd = endAt ?? startAt;
  return intervalsOverlap(startAt, eventEnd, rangeStart, rangeEnd);
}

/** Formats a day column header (e.g. "Mon 6/24") in the viewer timezone. */
export function formatDayHeader(date: Date, timeZone = DEFAULT_VIEWER_TIMEZONE): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone,
  });
}

/** Formats a time or date span for calendar blocks in the viewer timezone. */
export function formatEventTime(
  startAt: string,
  endAt: string | null,
  proposalType: "event" | "sleeping" | "fast_sleep" | string = "event",
  timeZone = DEFAULT_VIEWER_TIMEZONE,
  isAllDay = false,
): string {
  const dateOnly = proposalType === "sleeping" || proposalType === "fast_sleep" || isAllDay;
  if (dateOnly) {
    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    };
    const startLabel = new Date(startAt).toLocaleDateString(undefined, dateOpts);
    // All-day events may span multiple calendar days — show the inclusive range.
    if (isAllDay && endAt) {
      const endKey = localDateKey(endAt, timeZone);
      const startKey = localDateKey(startAt, timeZone);
      if (endKey !== startKey) {
        const endLabel = new Date(endAt).toLocaleDateString(undefined, dateOpts);
        return `All day · ${startLabel} – ${endLabel}`;
      }
    }
    return isAllDay ? `All day · ${startLabel}` : startLabel;
  }

  const start = new Date(startAt);
  const end = endAt ? new Date(endAt) : null;
  const dateOpts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  };
  if (!end || end.getTime() === start.getTime()) {
    return start.toLocaleTimeString(undefined, dateOpts);
  }
  const sameDay =
    start.toLocaleDateString(undefined, { timeZone }) ===
    end.toLocaleDateString(undefined, { timeZone });
  if (sameDay) {
    return `${start.toLocaleTimeString(undefined, dateOpts)} – ${end.toLocaleTimeString(undefined, dateOpts)}`;
  }
  return `${start.toLocaleString(undefined, { month: "short", day: "numeric", ...dateOpts })} – ${end.toLocaleString(undefined, { month: "short", day: "numeric", ...dateOpts })}`;
}

/** ISO date key yyyy-mm-dd in the viewer timezone for grouping. */
export function localDateKey(iso: string, timeZone = DEFAULT_VIEWER_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/** True when `day` falls on today in the viewer timezone (PC-59). */
export function isTodayDate(day: Date, timeZone = DEFAULT_VIEWER_TIMEZONE): boolean {
  return localDateKey(day.toISOString(), timeZone) === localDateKey(new Date().toISOString(), timeZone);
}

/** True when `day` is strictly before today in the viewer timezone (PC-59). */
export function isPastDate(day: Date, timeZone = DEFAULT_VIEWER_TIMEZONE): boolean {
  return localDateKey(day.toISOString(), timeZone) < localDateKey(new Date().toISOString(), timeZone);
}

/** Shared calendar cell styles for past/today emphasis (PC-59). */
export function scheduleDayCellSx(
  day: Date,
  timeZone = DEFAULT_VIEWER_TIMEZONE,
): { borderColor: string; bgcolor: string; opacity: number } {
  const isToday = isTodayDate(day, timeZone);
  const isPast = isPastDate(day, timeZone);
  return {
    borderColor: isToday ? "primary.main" : "divider",
    bgcolor: isToday
      ? GARDEN_TOKENS.todayHighlight
      : isPast
        ? "action.disabledBackground"
        : "background.paper",
    opacity: isPast ? 0.55 : 1,
  };
}
