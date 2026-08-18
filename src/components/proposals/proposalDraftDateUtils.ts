/**
 * Local date/datetime helpers for proposal draft form inputs (PC-132 / PC-376).
 * Kept pure so draft dialog sections can share without pulling React state.
 *
 * Timed `datetime-local` values follow the browser wall clock (native input
 * contract). Account-timezone formatting for display lives in formatTimeRange /
 * formatEventTime. Civil sleeping/all-day dates stay date-only / noon-UTC.
 */

import { DEFAULT_VIEWER_TIMEZONE, resolveTimezone } from "@/lib/schedule/timezone";
import { localDateKey } from "@/lib/schedule/dates";

/** Datetime-local string from ISO (YYYY-MM-DDTHH:mm) in browser local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Date-only input for sleeping / all-day proposals (no clock times).
 * Uses account timezone when provided so civil days match schedule (PC-376).
 */
export function toLocalDateInput(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return localDateKey(iso, resolveTimezone(timeZone));
}

/** Parses datetime-local value as browser-local wall clock → UTC ISO. */
export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function localDateToStartIso(value: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  // Noon-UTC civil bounds — stable across viewer timezones (PC-258 / PC-301).
  return `${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`;
}

export function localDateToEndIso(value: string): string | undefined {
  // Same-day all-day uses identical start/end noon bounds so the event never
  // spills into a second civil day in week/agenda placement (PC-239 / PC-301).
  return localDateToStartIso(value);
}

export function slotStartInput(
  iso: string | null | undefined,
  proposalType: "event" | "sleeping",
  isAllDay = false,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  return proposalType === "sleeping" || isAllDay
    ? toLocalDateInput(iso, timeZone)
    : toLocalInput(iso);
}

export type InviteeSelection = "none" | "required" | "optional" | "booked";

export interface SlotDraft {
  startAt: string;
  endAt: string;
  label: string;
}
