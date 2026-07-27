/**
 * Local date/datetime helpers for proposal draft form inputs (PC-132 / PC-376).
 * Kept pure so draft dialog sections can share without pulling React state.
 * Timed inputs use the account IANA timezone (default America/New_York).
 */

import { DEFAULT_VIEWER_TIMEZONE, resolveTimezone } from "@/lib/schedule/timezone";

function zonedParts(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour: num("hour"),
    minute: num("minute"),
  };
}

/**
 * Converts a wall-clock datetime in `timeZone` to a UTC ISO string.
 * Uses iterative offset correction so DST edges stay correct (PC-376).
 */
export function wallDateTimeToIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  const tz = resolveTimezone(timeZone);
  // Initial guess: treat the wall clock as UTC, then nudge by the zone offset.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const asUtc = new Date(utcMs);
    const parts = zonedParts(asUtc, tz);
    const asWallMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      0,
      0,
    );
    const desiredWallMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const delta = desiredWallMs - asWallMs;
    if (delta === 0) break;
    utcMs += delta;
  }
  return new Date(utcMs).toISOString();
}

/** Datetime-local string from ISO in the account timezone (YYYY-MM-DDTHH:mm). */
export function toLocalInput(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedParts(date, resolveTimezone(timeZone));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** Date-only input for sleeping / all-day proposals (no clock times). */
export function toLocalDateInput(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedParts(date, resolveTimezone(timeZone));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Parses datetime-local value as wall clock in account timezone → UTC ISO. */
export function localInputToIso(
  value: string,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }
  return wallDateTimeToIso(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    timeZone,
  );
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
    : toLocalInput(iso, timeZone);
}

export type InviteeSelection = "none" | "required" | "optional";

export interface SlotDraft {
  startAt: string;
  endAt: string;
  label: string;
}
