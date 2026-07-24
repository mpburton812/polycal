import { describe, expect, it } from "vitest";

import { buildIcsDocument } from "@/lib/calendar/ics";
import {
  buildCalendarEventPayload,
  buildIcsUid,
  nextAllDayDate,
  type ProposalRow,
} from "@/lib/calendar/payloads";

function proposal(overrides: Partial<ProposalRow>): ProposalRow {
  return {
    id: "prop-1",
    title: "Dinner",
    description: null,
    proposalType: "event",
    state: "resolved",
    proposerId: "u1",
    locationId: null,
    locationText: "Home",
    intentionalSolo: false,
    eventPrivacy: "open",
    isPoll: false,
    isAllDay: false,
    isRecurrenceParent: false,
    parentProposalId: null,
    occurrenceIndex: null,
    bedroomIndex: null,
    notes: null,
    scheduledStartAt: "2026-08-01T18:00:00.000Z",
    scheduledEndAt: "2026-08-01T20:00:00.000Z",
    winningSlotId: null,
    atRisk: false,
    atRiskExpiresAt: null,
    pendingRecoveryUntil: null,
    reminderOffsetMinutes: null,
    reminderSentAt: null,
    eventIconKey: null,
    recurrenceRule: null,
    isBatchSleeping: false,
    batchEntriesJson: null,
    batchGroupId: null,
    lastNudgeAt: null,
    detachedFromParentId: null,
    detachedFromSlotId: null,
    detachedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("calendar payloads", () => {
  it("builds timed event payloads as opaque", () => {
    const payload = buildCalendarEventPayload(proposal({}));
    expect(payload?.title).toBe("Dinner");
    expect(payload?.transparencyFree).toBe(false);
    expect(payload?.isAllDay).toBe(false);
  });

  it("builds sleeping payloads as all-day free with PolyCal title", () => {
    const title = "Sleeping: Morgan B., Doc KT, Confirmed, at Katie's Swingin' Pad";
    const payload = buildCalendarEventPayload(
      proposal({
        proposalType: "sleeping",
        title,
        scheduledStartAt: "2026-08-02T04:00:00.000Z",
        scheduledEndAt: null,
        isAllDay: false,
      }),
    );
    expect(payload?.title).toBe(title);
    expect(payload?.isAllDay).toBe(true);
    expect(payload?.transparencyFree).toBe(true);
  });

  it("builds stable ICS UIDs", () => {
    expect(buildIcsUid("user-a", "prop-1")).toBe("polycal-prop-1-user-a@polycal.app");
  });

  it("advances all-day exclusive end dates", () => {
    expect(nextAllDayDate("2026-08-02")).toBe("20260803");
  });
});

describe("ICS builder", () => {
  it("emits TRANSPARENT for sleeping and SUMMARY from PolyCal title", () => {
    const title = "Sleeping: Morgan B., Doc KT, Confirmed, at Katie's Swingin' Pad";
    const { body, uid } = buildIcsDocument({
      userId: "u1",
      proposalId: "prop-1",
      sequence: 0,
      method: "PUBLISH",
      payload: {
        title,
        startAt: "2026-08-02T04:00:00.000Z",
        endAt: null,
        isAllDay: true,
        transparencyFree: true,
        proposalType: "sleeping",
      },
    });
    expect(uid).toContain("prop-1");
    expect(body).toContain("TRANSP:TRANSPARENT");
    expect(body).toContain("SUMMARY:Sleeping: Morgan B.\\, Doc KT\\, Confirmed\\, at Katie's Swingin' Pad");
    expect(body).toContain("DTSTART;VALUE=DATE:");
  });

  it("increments SEQUENCE and marks CANCEL", () => {
    const { body } = buildIcsDocument({
      userId: "u1",
      proposalId: "prop-1",
      sequence: 3,
      method: "CANCEL",
      payload: {
        title: "Dinner",
        startAt: "2026-08-01T18:00:00.000Z",
        endAt: "2026-08-01T20:00:00.000Z",
        isAllDay: false,
        transparencyFree: false,
        proposalType: "event",
      },
    });
    expect(body).toContain("SEQUENCE:3");
    expect(body).toContain("METHOD:CANCEL");
    expect(body).toContain("STATUS:CANCELLED");
  });
});
