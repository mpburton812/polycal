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
});
