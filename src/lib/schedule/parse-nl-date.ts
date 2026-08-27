import * as chrono from "chrono-node";

/**
 * Parses a natural-language or ISO-ish date string to a Date (PC-492).
 * Returns null when chrono cannot resolve a calendar day.
 */
export function parseScheduleNlDate(
  text: string,
  now: Date = new Date(),
): Date | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Prefer explicit ISO / yyyy-MM-dd before free-text chrono.
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const iso = new Date(`${trimmed.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(iso.getTime())) return iso;
  }

  const parsed = chrono.parseDate(trimmed, now, { forwardDate: true });
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}
