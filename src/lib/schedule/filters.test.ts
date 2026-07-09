import { describe, expect, it } from "vitest";

import type { ScheduleEvent } from "@/actions/schedule";

import { filterScheduleEvents } from "./filters";

function event(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id: "evt-1",
    proposalId: "prop-1",
    title: "Test event",
    startAt: "2026-06-01T10:00:00.000Z",
    endAt: "2026-06-01T12:00:00.000Z",
    proposalType: "event",
    state: "resolved",
    proposerId: "user-a",
    proposerName: "User A",
    locationName: null,
    participantIds: ["user-a"],
    participantNames: ["User A"],
    intentionalSolo: false,
    isContentMasked: false,
    isTentative: false,
    atRisk: false,
    hasOverlap: false,
    isPoll: false,
    isAllDay: false,
    slotLabel: null,
    sliceKind: "standalone",
    rootProposalId: "prop-1",
    sliceKey: "prop-1",
    slotId: null,
    occurrenceProposalId: null,
    eventIconKey: null,
    ...overrides,
  };
}

describe("filterScheduleEvents", () => {
  const events = [
    event({ id: "whole", participantIds: ["user-a", "user-b"] }),
    event({
      id: "masked",
      isContentMasked: true,
      participantIds: ["user-b"],
    }),
    event({
      id: "solo",
      intentionalSolo: true,
      participantIds: ["user-a"],
    }),
    event({
      id: "sleep",
      proposalType: "sleeping",
      participantIds: ["user-b"],
    }),
  ];

  it("returns all events in whole-network mode", () => {
    const result = filterScheduleEvents(events, "whole", "user-a");
    expect(result.map((e) => e.id)).toEqual(["whole", "masked", "solo", "sleep"]);
  });

  it("hides masked content outside whole-network mode", () => {
    const result = filterScheduleEvents(events, "solo", "user-a");
    expect(result.map((e) => e.id)).not.toContain("masked");
  });

  it("filters sleeping network to viewer and partners", () => {
    const result = filterScheduleEvents(events, "sleeping_network", "user-a", undefined, [
      "user-b",
    ]);
    expect(result.map((e) => e.id)).toEqual(["sleep"]);
  });

  it("filters by selected person", () => {
    const result = filterScheduleEvents(events, "person", "user-a", "user-b");
    expect(result.every((e) => e.participantIds.includes("user-b"))).toBe(true);
  });
});
