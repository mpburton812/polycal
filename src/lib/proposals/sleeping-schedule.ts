/**
 * Sleeping proposals use calendar dates only — not clock-time blocks (PC-53).
 *
 * Date contract (PC-317): a sleeping night is a civil `yyyy-MM-dd` date anchored
 * to **midnight in an IANA timezone** (PC-282), NOT the host process locale
 * (which is UTC on Vercel) and NOT the noon-UTC bounds used for all-day events
 * (see `proposalDraftDateUtils`). `sleepingDateToStartIso` performs the civil
 * date → midnight-in-TZ mapping; `sleepingCalendarDayEnd` returns the inclusive
 * end of that civil day so single-night arrangements (which store a null end)
 * still occupy the whole day for archive/expiry/conflict comparisons.
 */

import { localDateKey } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE, resolveTimezone } from "@/lib/schedule/timezone";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Reads calendar + clock fields for an instant in a given IANA timezone.
 */
function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/**
 * Adds `delta` calendar days to a yyyy-MM-dd civil date (UTC arithmetic on the
 * date fields only — timezone-independent).
 */
function addCivilDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(y, m - 1, d + delta));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/**
 * Parses yyyy-MM-dd into midnight in `timeZone`, returned as a UTC ISO string.
 */
export function sleepingDateToStartIso(
  dateValue: string,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string | undefined {
  if (!dateValue) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!y || !m || !d) return undefined;

  const tz = resolveTimezone(timeZone);
  // Noon UTC on the civil date is a stable probe away from most DST edges.
  let guess = Date.UTC(y, m - 1, d, 12, 0, 0);
  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(guess), tz);
    const asUtcLike = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const wanted = Date.UTC(y, m - 1, d, 0, 0, 0);
    const diff = asUtcLike - wanted;
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

/**
 * Maps sleeping draft dates to scheduled bounds.
 * Single-night uses null end so UI/schedule show a date label, not an all-day block.
 */
export function sleepingScheduleFromDates(
  startDate: string,
  endDate?: string | null,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): { start: string | null; end: string | null } {
  const start = sleepingDateToStartIso(startDate, timeZone);
  if (!start) return { start: null, end: null };

  if (!endDate || endDate === startDate) {
    return { start, end: null };
  }

  const end = sleepingDateToStartIso(endDate, timeZone);
  return { start, end: end ?? null };
}

/** Converts stored ISO back to yyyy-MM-dd for date inputs in `timeZone`. */
export function isoToSleepingDateInput(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return localDateKey(iso, resolveTimezone(timeZone));
}

/**
 * Sleeping nights are whole calendar days; archive/grace/expiry run after the day
 * ends in `timeZone`, not at midnight when the night starts.
 */
export function sleepingCalendarDayEnd(
  isoOrDate: string,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): Date {
  const tz = resolveTimezone(timeZone);
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate.trim())
    ? isoOrDate.trim()
    : isoToSleepingDateInput(isoOrDate, tz);
  if (!ymd) {
    const fallback = new Date(isoOrDate);
    return new Date(
      fallback.getFullYear(),
      fallback.getMonth(),
      fallback.getDate(),
      23,
      59,
      59,
      999,
    );
  }
  const nextStart = sleepingDateToStartIso(addCivilDays(ymd, 1), tz);
  if (!nextStart) {
    return new Date(isoOrDate);
  }
  return new Date(new Date(nextStart).getTime() - 1);
}

/**
 * Normalizes resolved sleeping proposal schedule from slot rows.
 */
export function sleepingScheduleFromSlotRows(
  slots: { startAt: string; endAt: string | null }[],
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): { start: string | null; end: string | null } {
  if (slots.length === 0) return { start: null, end: null };
  const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  const startDate = isoToSleepingDateInput(first.startAt, timeZone);
  const endDate = isoToSleepingDateInput(last.endAt ?? last.startAt, timeZone);
  return sleepingScheduleFromDates(startDate, endDate, timeZone);
}
