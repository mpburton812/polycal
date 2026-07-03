import {
  isoToSleepingDateInput,
  sleepingDateToStartIso,
} from "@/lib/proposals/sleeping-schedule";

/** Parses yyyy-MM-dd into local end-of-day ISO for all-day event blocks. */
export function dateToEndIso(dateValue: string): string | undefined {
  if (!dateValue) return undefined;
  const [y, m, d] = dateValue.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/**
 * Maps all-day draft dates to stored slot bounds (local midnight through end of day).
 */
export function allDayEventFromDates(
  startDate: string,
  endDate?: string | null,
): { startAt: string; endAt: string } | null {
  const startAt = sleepingDateToStartIso(startDate);
  if (!startAt) return null;
  const end = endDate?.trim() || startDate;
  const endAt = dateToEndIso(end);
  if (!endAt) return null;
  return { startAt, endAt };
}

/**
 * Detects all-day events stored as local-midnight start and end-of-day end (or missing end).
 */
export function isAllDayEventSlot(startAt: string, endAt: string | null): boolean {
  const startDate = isoToSleepingDateInput(startAt);
  if (!startDate || sleepingDateToStartIso(startDate) !== startAt) {
    return false;
  }
  if (!endAt) return true;
  const endDate = isoToSleepingDateInput(endAt);
  return dateToEndIso(endDate) === endAt;
}

/** Human-readable label for all-day event spans on cards and schedule blocks. */
export function formatAllDayEventLabel(startAt: string, endAt: string | null): string {
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const startLabel = new Date(startAt).toLocaleDateString(undefined, dateOpts);
  if (!endAt) {
    return `All day, ${startLabel}`;
  }
  const endLabel = new Date(endAt).toLocaleDateString(undefined, dateOpts);
  const startKey = isoToSleepingDateInput(startAt);
  const endKey = isoToSleepingDateInput(endAt);
  if (startKey === endKey) {
    return `All day, ${startLabel}`;
  }
  return `All day, ${startLabel} – ${endLabel}`;
}
