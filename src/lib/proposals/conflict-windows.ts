/**
 * Overlap windows for proposal conflict checks (PC-318).
 *
 * Conflict detection must agree with what the calendar renders. Rather than
 * re-deriving windows from raw slots/resolved times, callers build the SAME
 * windows the schedule uses via {@link buildScheduleWindows}, then WIDEN each
 * window's end bound for a strict {@link intervalsOverlap} compare so that:
 *   - sleeping nights (calendar-date-only, frequently a null end) occupy the
 *     whole civil day, so same-night arrangements collide (parity with the
 *     calendar's markOverlaps sleeping widening);
 *   - single-day all-day events (noon-UTC point bounds from
 *     {@link allDayBoundsForDateKey}) collide when they share a civil day
 *     instead of only when their instants are byte-identical.
 * Timed events keep their exact start/end so hour-level overlaps are unchanged.
 *
 * PC-59 (events never conflict with sleeping) is enforced by callers via a
 * same-`proposalType` guard, not here — this module only shapes the windows.
 */
import { sleepingCalendarDayEnd } from "@/lib/proposals/sleeping-schedule";
import { intervalsOverlap } from "@/lib/schedule/dates";
import {
  buildScheduleWindows,
  type ScheduleRowSliceContext,
  type ScheduleSlotRow,
} from "@/lib/schedule/schedule-slices";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

export interface ConflictWindow {
  start: string;
  end: string | null;
}

/** Row context for {@link buildConflictWindows} — schedule slice flags + type. */
export interface ConflictWindowRow extends ScheduleRowSliceContext {
  proposalType: string;
}

/**
 * Widens a single window's end bound to the end of its civil day for
 * calendar-date-only kinds (sleeping + all-day). Timed events are unchanged.
 *
 * Why widen the END and keep the START: two same-day date-only windows share a
 * civil day, so widening either end past the shared noon/midnight start makes
 * `start < otherEnd && otherStart < end` true; adjacent civil days still miss
 * because each day's end lands before the next day's start bound.
 */
export function widenConflictWindow(
  startAt: string,
  endAt: string | null,
  proposalType: string,
  isAllDay: boolean,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ConflictWindow {
  if (proposalType === "sleeping" || isAllDay) {
    return {
      start: startAt,
      end: sleepingCalendarDayEnd(endAt ?? startAt, timeZone).toISOString(),
    };
  }
  return { start: startAt, end: endAt };
}

/**
 * Builds widened overlap windows for a proposal from its slots / resolved times
 * using the calendar's {@link buildScheduleWindows} (PC-318).
 */
export function buildConflictWindows(
  row: ConflictWindowRow,
  slots: ScheduleSlotRow[],
  scheduled: { startAt: string; endAt: string | null } | null,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): ConflictWindow[] {
  return buildScheduleWindows(row, slots, scheduled, timeZone).map((win) =>
    widenConflictWindow(win.startAt, win.endAt, row.proposalType, row.isAllDay, timeZone),
  );
}

/**
 * True when two proposals' widened windows overlap in time.
 *
 * Enforces PC-59: events never conflict with sleeping arrangements, so only
 * same-`proposalType` pairs are compared. Callers should still short-circuit on
 * type mismatch before loading the other side's windows.
 */
export function windowsConflict(
  aType: string,
  aWindows: ConflictWindow[],
  bType: string,
  bWindows: ConflictWindow[],
): boolean {
  if (aType !== bType) return false;
  return aWindows.some((a) =>
    bWindows.some((b) => intervalsOverlap(a.start, a.end, b.start, b.end)),
  );
}
