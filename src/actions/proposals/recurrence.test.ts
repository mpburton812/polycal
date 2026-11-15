import { describe, expect, it } from "vitest";

import { buildRecurrenceOccurrences, parseRecurrenceRule } from "./_helpers";

describe("recurrence interval", () => {
  it("spaces weekly interval 2 occurrences 14 days apart from a Monday start", () => {
    // Monday 5 Jan 2026, local noon — January has no DST transition.
    const start = new Date(2026, 0, 5, 12, 0, 0);
    expect(start.getDay()).toBe(1);

    const occurrences = buildRecurrenceOccurrences(start.toISOString(), null, {
      pattern: "weekly",
      interval: 2,
      count: 3,
    });

    expect(occurrences).toHaveLength(3);
    const times = occurrences.map((occurrence) => new Date(occurrence.startAt).getTime());
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(times[1] - times[0]).toBe(fourteenDaysMs);
    expect(times[2] - times[1]).toBe(fourteenDaysMs);
  });

  it("parses recurrence JSON without interval as interval 1", () => {
    expect(parseRecurrenceRule(JSON.stringify({ pattern: "weekly", count: 4 }))).toEqual({
      pattern: "weekly",
      interval: 1,
      count: 4,
    });
  });
});
