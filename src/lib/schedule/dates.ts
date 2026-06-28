/** Monday-based week boundaries for the schedule tab (PC-42). */

/**
 * Returns midnight local time for the Monday starting the week containing `date`.
 */
export function startOfWeekMonday(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
}

/** Inclusive range end at Sunday 23:59:59.999 for a week starting `weekStart`. */
export function endOfWeekSunday(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** Adds `days` to a date copy. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
export function formatDayHeader(date: Date, timeZone = "UTC"): string {
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
  proposalType: "event" | "sleeping" = "event",
  timeZone = "UTC",
): string {
  if (proposalType === "sleeping") {
    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone,
    };
    return new Date(startAt).toLocaleDateString(undefined, dateOpts);
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
export function localDateKey(iso: string, timeZone = "UTC"): string {
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
