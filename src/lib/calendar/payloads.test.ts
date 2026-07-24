import { describe, expect, it } from "vitest";

import { buildCalendarEventPayload, nextAllDayDate, type ProposalRow } from "@/lib/calendar/payloads";

function proposal(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "p1",
    title: "Sleeping batch",
    description: null,
    notes: null,
    proposalType: "sleeping",
    state: "resolved",
    proposerId: "u1",
    locationId: null,
    locationText: null,
    intentionalSolo: false,
    isAllDay: true,
    isPoll: false,
    isRecurring: false,
    recurrenceRule: null,
    seriesId: null,
    occurrenceIndex: null,
    parentProposalId: null,
    scheduledStartAt: "2026-08-01T04:00:00.000Z",
    scheduledEndAt: "2026-08-03T04:00:00.000Z",
    winningSlotId: null,
    atRisk: false,
    atRiskExpiresAt: null,
    isBatchSleeping: true,
    batchEntriesJson: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as ProposalRow;
}

describe("buildCalendarEventPayload batch sleeping (PC-347)", () => {
  it("maps first→last night to one all-day free payload", () => {
    const payload = buildCalendarEventPayload(proposal());
    expect(payload).not.toBeNull();
    expect(payload!.isAllDay).toBe(true);
    expect(payload!.transparencyFree).toBe(true);
    expect(payload!.startAt).toBe("2026-08-01T04:00:00.000Z");
    expect(payload!.endAt).toBe("2026-08-03T04:00:00.000Z");
    // Google exclusive end is day after last night.
    expect(nextAllDayDate(payload!.endAt!)).toBe("20260804");
  });

  it("returns null without scheduledStartAt", () => {
    expect(buildCalendarEventPayload(proposal({ scheduledStartAt: null }))).toBeNull();
  });
});
