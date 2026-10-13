import { localDateKey } from "@/lib/schedule/dates";
import { DEFAULT_VIEWER_TIMEZONE } from "@/lib/schedule/timezone";

const DAY_MINUTES = 24 * 60;

/** Minutes from local midnight for an instant in the viewer timezone. */
export function minutesInTimeZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  // Some engines report midnight as 24.
  const normalizedHour = hour === 24 ? 0 : hour;
  return normalizedHour * 60 + minute;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Vertical span of a timed event on one civil day (PC-532).
 * A later end — including one that crosses midnight — keeps its real duration.
 * Only a missing or non-positive end collapses to one hour.
 */
export function dayGridSpanMinutes(
  startAt: string,
  endAt: string | null,
  dayKey: string,
  timeZone: string = DEFAULT_VIEWER_TIMEZONE,
): { startMin: number; endMin: number } {
  const startKey = localDateKey(startAt, timeZone);
  const endIso = endAt ?? startAt;
  const endKey = localDateKey(endIso, timeZone);
  let startMin = startKey === dayKey ? minutesInTimeZone(startAt, timeZone) : 0;
  let endMin = endKey === dayKey ? minutesInTimeZone(endIso, timeZone) : DAY_MINUTES;
  if (!endAt || endMin <= startMin) {
    endMin = Math.min(DAY_MINUTES, startMin + 60);
  }
  startMin = clamp(startMin, 0, DAY_MINUTES - 15);
  endMin = clamp(endMin, startMin + 15, DAY_MINUTES);
  return { startMin, endMin };
}
