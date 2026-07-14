import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const ISO_DATE = "YYYY-MM-DD";

/** True when value is a strict local calendar date YYYY-MM-DD. */
export function isStrictIsoDate(value: string): boolean {
  if (!value) return false;
  return dayjs(value, ISO_DATE, true).isValid();
}

export interface OrderedDateRange {
  start: string;
  end: string;
}

/**
 * Maps Day / End day text into stored range values (PC-209).
 * Lexicographic reorder runs only when BOTH sides are valid ISO dates so
 * partial End day typing (e.g. "1", "2") cannot clobber Day.
 */
export function orderDateRangeInputs(startInput: string, endInput: string): OrderedDateRange {
  const a = startInput.trim();
  const b = endInput.trim();

  if (!a) {
    return { start: "", end: "" };
  }
  if (!b || b === a) {
    return { start: a, end: "" };
  }

  if (isStrictIsoDate(a) && isStrictIsoDate(b)) {
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }

  // Incomplete or invalid ISO on either side — keep field identity while typing.
  return { start: a, end: b };
}
