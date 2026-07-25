import { describe, expect, it } from "vitest";

import { buildIcsDocument, buildIcsMultiDocument } from "@/lib/calendar/ics";
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
  } as ProposalRow;
}

describe("calendar payloads", () => {
  it("builds timed event payloads as opaque", () => {
    const payload = buildCalendarEventPayload(proposal({}));
    expect(payload?.title).toBe("Dinner");
    expect(payload?.transparencyFree).toBe(false);
    expect(payload?.isAllDay).toBe(false);
  });

  it("strips Confirmed from legacy sleeping titles (PC-351)", () => {
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
    expect(payload?.title).toBe("Sleeping: Morgan B., Doc KT, at Katie's Swingin' Pad");
    expect(payload?.isAllDay).toBe(true);
    expect(payload?.transparencyFree).toBe(true);
    expect(payload?.location).toBe("Home");
  });

  it("builds stable ICS UIDs including night keys", () => {
    expect(buildIcsUid("user-a", "prop-1")).toBe("polycal-prop-1-user-a@polycal.app");
    expect(buildIcsUid("user-a", "prop-1", "2026-08-01")).toBe(
      "polycal-prop-1-2026-08-01-user-a@polycal.app",
    );
  });

  it("advances all-day exclusive end dates", () => {
    expect(nextAllDayDate("2026-08-02")).toBe("20260803");
  });
});

describe("ICS builder", () => {
  it("emits TRANSPARENT, LOCATION, and SUMMARY without Confirmed (PC-351)", () => {
    const title = "Sleeping: Morgan B., Doc KT, at Katie's Swingin' Pad";
    const { body, uid } = buildIcsDocument({
      userId: "u1",
      proposalId: "prop-1",
      sequence: 0,
      method: "PUBLISH",
      payload: {
        title,
        location: "Katie's Swingin' Pad",
        startAt: "2026-08-02T04:00:00.000Z",
        endAt: null,
        isAllDay: true,
        transparencyFree: true,
        proposalType: "sleeping",
        nightKey: "",
      },
    });
    expect(uid).toContain("prop-1");
    expect(body).toContain("TRANSP:TRANSPARENT");
    expect(body).toContain("LOCATION:Katie's Swingin' Pad");
    expect(body).toContain("SUMMARY:Sleeping: Morgan B.\\, Doc KT\\, at Katie's Swingin' Pad");
    expect(body).not.toContain("Confirmed");
    expect(body).toContain("DTSTART;VALUE=DATE:");
  });

  it("emits multiple VEVENTs for batch nights (PC-351)", () => {
    const { body } = buildIcsMultiDocument({
      method: "PUBLISH",
      events: [
        {
          uid: "polycal-prop-1-2026-08-01-u1@polycal.app",
          sequence: 0,
          payload: {
            title: "Sleeping: Luke, Leia, at Pad A",
            location: "Pad A",
            startAt: "2026-08-01T00:00:00.000Z",
            endAt: "2026-08-01T00:00:00.000Z",
            isAllDay: true,
            transparencyFree: true,
            proposalType: "sleeping",
            nightKey: "2026-08-01",
          },
        },
        {
          uid: "polycal-prop-1-2026-08-02-u1@polycal.app",
          sequence: 0,
          payload: {
            title: "Sleeping: Luke, Leia, at Pad B",
            location: "Pad B",
            startAt: "2026-08-02T00:00:00.000Z",
            endAt: "2026-08-02T00:00:00.000Z",
            isAllDay: true,
            transparencyFree: true,
            proposalType: "sleeping",
            nightKey: "2026-08-02",
          },
        },
      ],
    });
    expect(body.match(/BEGIN:VEVENT/g)?.length).toBe(2);
    expect(body).toContain("LOCATION:Pad A");
    expect(body).toContain("LOCATION:Pad B");
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
        nightKey: "",
      },
    });
    expect(body).toContain("SEQUENCE:3");
    expect(body).toContain("METHOD:CANCEL");
    expect(body).toContain("STATUS:CANCELLED");
  });
});
