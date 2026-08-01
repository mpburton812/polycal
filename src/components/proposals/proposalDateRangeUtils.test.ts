import { describe, expect, it } from "vitest";

import {
  isStrictIsoDate,
  orderDateRangeInputs,
} from "@/components/proposals/proposalDateRangeUtils";

describe("isStrictIsoDate", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(isStrictIsoDate("2026-07-13")).toBe(true);
  });

  it("rejects partial, empty, and garbage", () => {
    expect(isStrictIsoDate("")).toBe(false);
    expect(isStrictIsoDate("2")).toBe(false);
    expect(isStrictIsoDate("2026-07")).toBe(false);
    expect(isStrictIsoDate("abc")).toBe(false);
    expect(isStrictIsoDate("-1")).toBe(false);
  });
});

describe("orderDateRangeInputs", () => {
  it("keeps Day intact while End day is a single digit (PC-209 regression)", () => {
    expect(orderDateRangeInputs("2026-07-13", "2")).toEqual({
      start: "2026-07-13",
      end: "2",
    });
    expect(orderDateRangeInputs("2026-07-13", "1")).toEqual({
      start: "2026-07-13",
      end: "1",
    });
  });

  it("preserves partial End day prefixes while typing a later ISO", () => {
    expect(orderDateRangeInputs("2026-07-13", "2026")).toEqual({
      start: "2026-07-13",
      end: "2026",
    });
    expect(orderDateRangeInputs("2026-07-13", "2026-07-1")).toEqual({
      start: "2026-07-13",
      end: "2026-07-1",
    });
  });

  it("orders two complete ISO dates earliest → latest", () => {
    expect(orderDateRangeInputs("2026-07-15", "2026-07-13")).toEqual({
      start: "2026-07-13",
      end: "2026-07-15",
    });
    expect(orderDateRangeInputs("2026-07-13", "2026-07-15")).toEqual({
      start: "2026-07-13",
      end: "2026-07-15",
    });
  });

  it("clears end when equal or empty end", () => {
    expect(orderDateRangeInputs("2026-07-13", "")).toEqual({
      start: "2026-07-13",
      end: "",
    });
    expect(orderDateRangeInputs("2026-07-13", "2026-07-13")).toEqual({
      start: "2026-07-13",
      end: "",
    });
  });

  it("clears both when start is empty", () => {
    expect(orderDateRangeInputs("", "2026-07-13")).toEqual({ start: "", end: "" });
  });

  it("does not swap letters into the other field", () => {
    expect(orderDateRangeInputs("2026-07-13", "ab")).toEqual({
      start: "2026-07-13",
      end: "ab",
    });
  });
});
