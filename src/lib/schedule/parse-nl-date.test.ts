import { describe, expect, it } from "vitest";

import { parseScheduleNlDate } from "./parse-nl-date";

describe("parseScheduleNlDate", () => {
  it("parses yyyy-MM-dd", () => {
    const date = parseScheduleNlDate("2026-09-15", new Date("2026-08-27T12:00:00"));
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(8);
    expect(date!.getDate()).toBe(15);
  });

  it("parses relative phrases", () => {
    const now = new Date("2026-08-27T12:00:00");
    const date = parseScheduleNlDate("next Tuesday", now);
    expect(date).not.toBeNull();
    expect(date!.getDay()).toBe(2);
  });

  it("returns null for empty / nonsense", () => {
    expect(parseScheduleNlDate("")).toBeNull();
    expect(parseScheduleNlDate("   ")).toBeNull();
    expect(parseScheduleNlDate("not a real date xyzzy")).toBeNull();
  });
});
