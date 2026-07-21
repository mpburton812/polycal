import { describe, expect, it } from "vitest";

import { markOverlaps, type OverlapCandidate } from "./overlaps";

function candidate(overrides: Partial<OverlapCandidate>): OverlapCandidate {
  return {
    proposalType: "event",
    startAt: "2026-07-10T10:00:00.000Z",
    endAt: "2026-07-10T11:00:00.000Z",
    participantIds: ["u1"],
    hasOverlap: false,
    ...overrides,
  };
}

describe("markOverlaps", () => {
  it("flags overlapping events that share a participant", () => {
    const events = [
      candidate({ startAt: "2026-07-10T10:00:00.000Z", endAt: "2026-07-10T11:00:00.000Z" }),
      candidate({ startAt: "2026-07-10T10:30:00.000Z", endAt: "2026-07-10T11:30:00.000Z" }),
    ];
    const result = markOverlaps(events);
    expect(result[0]!.hasOverlap).toBe(true);
    expect(result[1]!.hasOverlap).toBe(true);
  });

  it("does not flag events without shared participants", () => {
    const events = [
      candidate({ participantIds: ["u1"] }),
      candidate({ participantIds: ["u2"] }),
    ];
    const result = markOverlaps(events);
    expect(result[0]!.hasOverlap).toBe(false);
    expect(result[1]!.hasOverlap).toBe(false);
  });

  it("never flags sleeping against event even with shared participant and overlapping time (PC-59 parity)", () => {
    const events = [
      candidate({
        proposalType: "sleeping",
        startAt: "2026-07-10T00:00:00.000Z",
        endAt: null,
        participantIds: ["u1"],
      }),
      candidate({
        proposalType: "event",
        startAt: "2026-07-10T10:00:00.000Z",
        endAt: "2026-07-10T11:00:00.000Z",
        participantIds: ["u1"],
      }),
    ];
    const result = markOverlaps(events);
    expect(result[0]!.hasOverlap).toBe(false);
    expect(result[1]!.hasOverlap).toBe(false);
  });

  it("expands single-night sleeping windows to the full day so same-night pairs overlap", () => {
    const events = [
      candidate({
        proposalType: "sleeping",
        startAt: "2026-07-10T00:00:00.000Z",
        endAt: null,
        participantIds: ["u1"],
      }),
      candidate({
        proposalType: "sleeping",
        startAt: "2026-07-10T00:00:00.000Z",
        endAt: null,
        participantIds: ["u1"],
      }),
    ];
    const result = markOverlaps(events);
    expect(result[0]!.hasOverlap).toBe(true);
    expect(result[1]!.hasOverlap).toBe(true);
  });

  it("does not flag sleeping arrangements on different nights", () => {
    const events = [
      candidate({
        proposalType: "sleeping",
        startAt: "2026-07-10T00:00:00.000Z",
        endAt: null,
        participantIds: ["u1"],
      }),
      candidate({
        proposalType: "sleeping",
        startAt: "2026-07-11T00:00:00.000Z",
        endAt: null,
        participantIds: ["u1"],
      }),
    ];
    const result = markOverlaps(events);
    expect(result[0]!.hasOverlap).toBe(false);
    expect(result[1]!.hasOverlap).toBe(false);
  });

  it("flags overlapping pairs in large lists via day buckets (PC-282)", () => {
    const events: OverlapCandidate[] = [];
    for (let i = 0; i < 40; i += 1) {
      const day = 1 + (i % 20);
      const dayStr = String(day).padStart(2, "0");
      events.push(
        candidate({
          startAt: `2026-07-${dayStr}T10:00:00.000Z`,
          endAt: `2026-07-${dayStr}T11:00:00.000Z`,
          participantIds: [`u${i}`],
        }),
      );
    }
    // Two entries on the same day with a shared participant — should flag.
    events.push(
      candidate({
        startAt: "2026-07-05T10:00:00.000Z",
        endAt: "2026-07-05T11:00:00.000Z",
        participantIds: ["shared"],
      }),
      candidate({
        startAt: "2026-07-05T10:30:00.000Z",
        endAt: "2026-07-05T11:30:00.000Z",
        participantIds: ["shared"],
      }),
    );

    const result = markOverlaps(events);
    const flagged = result.filter((e) => e.hasOverlap);
    expect(flagged).toHaveLength(2);
    expect(flagged.every((e) => e.participantIds.includes("shared"))).toBe(true);
  });

  it("does not flag same participant on distinct days in large lists", () => {
    const events: OverlapCandidate[] = [];
    for (let i = 1; i <= 40; i += 1) {
      // Spread across Jul/Aug so each 1h block is on its own UTC day.
      const month = i <= 28 ? "07" : "08";
      const day = i <= 28 ? i : i - 28;
      const dayStr = String(day).padStart(2, "0");
      events.push(
        candidate({
          startAt: `2026-${month}-${dayStr}T10:00:00.000Z`,
          endAt: `2026-${month}-${dayStr}T11:00:00.000Z`,
          participantIds: ["u1"],
        }),
      );
    }
    const result = markOverlaps(events);
    expect(result.every((e) => !e.hasOverlap)).toBe(true);
  });
});
