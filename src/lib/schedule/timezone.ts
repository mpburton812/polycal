/** Common IANA timezones for profile selection (PC-48 / spec §10). */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
] as const;

export type CommonTimezone = (typeof COMMON_TIMEZONES)[number];

/** Default viewer timezone when none is stored (PC-118). */
export const DEFAULT_VIEWER_TIMEZONE = "America/New_York";

/**
 * Resolves a stored timezone string, defaulting to US Eastern when unset (PC-118)
 * and falling back to UTC when invalid (PC-48).
 */
export function resolveTimezone(value: string | null | undefined): string {
  if (!value?.trim()) return DEFAULT_VIEWER_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/**
 * Browser-local default timezone for new users when available (PC-48).
 * Falls back to {@link DEFAULT_VIEWER_TIMEZONE} when detection is unavailable.
 */
export function defaultBrowserTimezone(): string {
  if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) return detected;
  }
  return DEFAULT_VIEWER_TIMEZONE;
}
