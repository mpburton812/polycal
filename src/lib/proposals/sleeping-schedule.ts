/**
 * Sleeping proposals use calendar dates only — not clock-time blocks (PC-53).
 */

/** Parses yyyy-MM-dd into local midnight ISO for storage. */
export function sleepingDateToStartIso(dateValue: string): string | undefined {
  if (!dateValue) return undefined;
  const [y, m, d] = dateValue.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/**
 * Maps sleeping draft dates to scheduled bounds.
 * Single-night uses null end so UI/schedule show a date label, not an all-day block.
 */
export function sleepingScheduleFromDates(
  startDate: string,
  endDate?: string | null,
): { start: string | null; end: string | null } {
  const start = sleepingDateToStartIso(startDate);
  if (!start) return { start: null, end: null };

  if (!endDate || endDate === startDate) {
    return { start, end: null };
  }

  const end = sleepingDateToStartIso(endDate);
  return { start, end: end ?? null };
}

/** Converts stored ISO back to yyyy-MM-dd for date inputs. */
export function isoToSleepingDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Sleeping nights are whole calendar days; archive/grace should run after the day ends,
 * not at local midnight when the night "starts".
 */
export function sleepingCalendarDayEnd(iso: string): Date {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/**
 * Normalizes resolved sleeping proposal schedule from slot rows.
 */
export function sleepingScheduleFromSlotRows(
  slots: { startAt: string; endAt: string | null }[],
): { start: string | null; end: string | null } {
  if (slots.length === 0) return { start: null, end: null };
  const sorted = [...slots].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const startDate = isoToSleepingDateInput(first.startAt);
  const endDate = isoToSleepingDateInput(last.endAt ?? last.startAt);
  return sleepingScheduleFromDates(startDate, endDate);
}
