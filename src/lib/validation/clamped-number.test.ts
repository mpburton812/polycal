import { describe, expect, it } from "vitest";

import {
  clampInteger,
  commitIntegerDraft,
  liveIntegerFromDraft,
  parseIntegerDraft,
  RECURRENCE_COUNT_MAX,
  RECURRENCE_COUNT_MIN,
  REMINDER_AMOUNT_MIN,
} from "@/lib/validation/clamped-number";

describe("parseIntegerDraft", () => {
  it("returns null for empty so the default digit is not restored mid-keystroke", () => {
    expect(parseIntegerDraft("")).toBeNull();
    expect(parseIntegerDraft("   ")).toBeNull();
  });

  it("rejects partial and non-integer input", () => {
    expect(parseIntegerDraft("12.")).toBeNull();
    expect(parseIntegerDraft("e")).toBeNull();
    expect(parseIntegerDraft("1e2")).toBeNull();
  });

  it("parses whole numbers including zero", () => {
    expect(parseIntegerDraft("0")).toBe(0);
    expect(parseIntegerDraft("12")).toBe(12);
  });
});

describe("liveIntegerFromDraft", () => {
  it("does not emit while Amount is cleared (replacing 1 with 2)", () => {
    expect(liveIntegerFromDraft("", REMINDER_AMOUNT_MIN)).toBeNull();
    expect(liveIntegerFromDraft("2", REMINDER_AMOUNT_MIN)).toBe(2);
  });

  it("keeps a leading 1 when Occurrences min is 2 so 12 can be typed", () => {
    expect(liveIntegerFromDraft("1", RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX)).toBeNull();
    expect(liveIntegerFromDraft("12", RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX)).toBe(12);
  });

  it("does not emit above max until blur clamp", () => {
    expect(liveIntegerFromDraft("99", RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX)).toBeNull();
  });
});

describe("commitIntegerDraft", () => {
  it("snaps empty Amount to min 1 on blur", () => {
    expect(commitIntegerDraft("", REMINDER_AMOUNT_MIN)).toBe(1);
  });

  it("clamps Occurrences to 2–52 on blur", () => {
    expect(commitIntegerDraft("1", RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX)).toBe(2);
    expect(commitIntegerDraft("20", RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX)).toBe(20);
    expect(commitIntegerDraft("99", RECURRENCE_COUNT_MIN, RECURRENCE_COUNT_MAX)).toBe(52);
  });
});

describe("clampInteger", () => {
  it("truncates and bounds", () => {
    expect(clampInteger(1.9, 0, 5)).toBe(1);
    expect(clampInteger(-4, 0)).toBe(0);
  });
});
