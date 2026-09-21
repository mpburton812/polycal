/** Recurrence occurrence count — matches draftProposalSchema recurrenceRule.count. */
export const RECURRENCE_COUNT_MIN = 2;
export const RECURRENCE_COUNT_MAX = 52;

/** Reminder UI amount — server stores minutes (min 1). */
export const REMINDER_AMOUNT_MIN = 1;

/** Place bedroom count (PC-40). */
export const BEDROOM_COUNT_MIN = 0;
export const BEDROOM_COUNT_MAX = 20;

/** Platform self-serve network creation caps. */
export const MAX_NETWORKS_PER_EMAIL_MIN = 1;
export const MAX_NETWORKS_PER_EMAIL_MAX = 100;
export const MAX_NETWORK_CREATES_PER_DAY_MIN = 1;
export const MAX_NETWORK_CREATES_PER_DAY_MAX = 1000;

/**
 * Parses a whole-number draft. Empty / partial / non-integer returns null so
 * controlled inputs can stay blank while the user replaces a digit (PC-519).
 */
export function parseIntegerDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/** Clamps a finite integer into [min, max]. */
export function clampInteger(value: number, min: number, max?: number): number {
  let next = Math.trunc(value);
  if (next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

/**
 * Live parent updates: only emit when the draft is a complete in-range integer.
 * Out-of-range prefixes (typing 12 with min 2) stay in the draft string.
 */
export function liveIntegerFromDraft(
  raw: string,
  min: number,
  max?: number,
): number | null {
  const parsed = parseIntegerDraft(raw);
  if (parsed === null) return null;
  if (parsed < min) return null;
  if (max !== undefined && parsed > max) return null;
  return parsed;
}

/** Blur / Enter: empty or invalid snaps to min; otherwise clamp. */
export function commitIntegerDraft(raw: string, min: number, max?: number): number {
  const parsed = parseIntegerDraft(raw);
  if (parsed === null) return min;
  return clampInteger(parsed, min, max);
}
