import { describe, expect, it } from "vitest";

import { sortDayEvents } from "./sort-day-events";

describe("sortDayEvents (PC-364)", () => {
  it("orders non-sleeping by startAt, then sleeping last", () => {
    const sorted = sortDayEvents([
      { startAt: "2026-08-02T10:00:00.000Z", proposalType: "sleeping", id: "s2" },
      { startAt: "2026-08-02T14:00:00.000Z", proposalType: "event", id: "e2" },
      { startAt: "2026-08-02T09:00:00.000Z", proposalType: "event", id: "e1" },
      { startAt: "2026-08-02T08:00:00.000Z", proposalType: "sleeping", id: "s1" },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["e1", "e2", "s1", "s2"]);
  });

  it("keeps an all-non-sleeping list sorted by startAt", () => {
    const sorted = sortDayEvents([
      { startAt: "2026-08-02T18:00:00.000Z", proposalType: "event", id: "b" },
      { startAt: "2026-08-02T08:00:00.000Z", proposalType: "event", id: "a" },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("orders sleeping-only lists by startAt", () => {
    const sorted = sortDayEvents([
      { startAt: "2026-08-03T00:00:00.000Z", proposalType: "sleeping", id: "late" },
      { startAt: "2026-08-01T00:00:00.000Z", proposalType: "sleeping", id: "early" },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["early", "late"]);
  });
});
