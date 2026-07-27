import { describe, expect, it } from "vitest";

import {
  buildCalendarEventPayload,
  buildCalendarEventPayloads,
  nextAllDayDate,
  resolveCalendarDescription,
  resolveCalendarLocation,
  type ProposalRow,
} from "@/lib/calendar/payloads";

function proposal(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "p1",
    title: "Sleeping: Luke, Leia, Confirmed, at Home",
    description: null,
    notes: null,
    proposalType: "sleeping",
    state: "resolved",
    proposerId: "u1",
    locationId: null,
    locationText: "Home",
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
    isBatchSleeping: false,
    batchEntriesJson: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as ProposalRow;
}

const names = {
  proposerName: "Luke",
  displayNameByUserId: { u1: "Luke", u2: "Leia", u3: "Han" },
  placeNameByLocationId: { loc1: "Tatooine Pad", loc2: "Falcon Berth" },
};

describe("buildCalendarEventPayload sleeping (PC-351)", () => {
  it("maps non-batch multi-night sleeping to one all-day free span", () => {
    const payload = buildCalendarEventPayload(proposal(), names);
    expect(payload).not.toBeNull();
    expect(payload!.isAllDay).toBe(true);
    expect(payload!.transparencyFree).toBe(true);
    expect(payload!.nightKey).toBe("");
    expect(payload!.startAt).toBe("2026-08-01T04:00:00.000Z");
    expect(payload!.endAt).toBe("2026-08-03T04:00:00.000Z");
    expect(nextAllDayDate(payload!.endAt!)).toBe("20260804");
    expect(payload!.location).toBe("Home");
    expect(payload!.title).toBe("Sleeping: Luke, at Home");
    expect(payload!.title).not.toContain("Confirmed");
  });

  it("expands batch sleeping into one all-day payload per night", () => {
    const batch = proposal({
      isBatchSleeping: true,
      locationText: null,
      batchEntriesJson: JSON.stringify([
        {
          id: "n1",
          nightDate: "2026-08-01",
          locationText: "Pad A",
          invitees: [{ userId: "u2", role: "required" }],
        },
        {
          id: "n2",
          nightDate: "2026-08-02",
          locationText: "Pad B",
          invitees: [{ userId: "u3", role: "required" }],
        },
      ]),
    });
    const payloads = buildCalendarEventPayloads(batch, names, "u1");
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.nightKey).toBe("2026-08-01");
    expect(payloads[0]!.location).toBe("Pad A");
    expect(payloads[0]!.title).toContain("at Pad A");
    expect(payloads[0]!.title).not.toContain("Confirmed");
    expect(payloads[1]!.nightKey).toBe("2026-08-02");
    expect(payloads[1]!.location).toBe("Pad B");
  });

  it("filters batch nights to nights the recipient is on", () => {
    const batch = proposal({
      isBatchSleeping: true,
      batchEntriesJson: JSON.stringify([
        {
          id: "n1",
          nightDate: "2026-08-01",
          locationText: "Pad A",
          invitees: [{ userId: "u2", role: "required" }],
        },
        {
          id: "n2",
          nightDate: "2026-08-02",
          intentionalSolo: true,
          invitees: [],
        },
      ]),
    });
    const forLeia = buildCalendarEventPayloads(batch, names, "u2");
    expect(forLeia).toHaveLength(1);
    expect(forLeia[0]!.nightKey).toBe("2026-08-01");

    const forProposer = buildCalendarEventPayloads(batch, names, "u1");
    expect(forProposer).toHaveLength(2);
  });

  it("returns empty without scheduledStartAt for non-batch", () => {
    expect(buildCalendarEventPayloads(proposal({ scheduledStartAt: null }))).toEqual([]);
  });
});

describe("calendar LOCATION + DESCRIPTION (PC-367)", () => {
  it("resolveCalendarLocation prefers locationText over place name", () => {
    expect(resolveCalendarLocation("Custom", "loc1", names.placeNameByLocationId)).toBe(
      "Custom",
    );
    expect(resolveCalendarLocation(null, "loc1", names.placeNameByLocationId)).toBe(
      "Tatooine Pad",
    );
    expect(resolveCalendarLocation("  ", "loc1", names.placeNameByLocationId)).toBe(
      "Tatooine Pad",
    );
    expect(resolveCalendarLocation(null, "missing", names.placeNameByLocationId)).toBeNull();
  });

  it("resolveCalendarDescription prefers comment then description+notes", () => {
    expect(
      resolveCalendarDescription({
        comment: "Night note",
        description: "Desc",
        notes: "Notes",
      }),
    ).toBe("Night note");
    expect(
      resolveCalendarDescription({
        description: "Desc",
        notes: "Notes",
      }),
    ).toBe("Desc\n\nNotes");
    expect(resolveCalendarDescription({ description: "Only desc" })).toBe("Only desc");
    expect(resolveCalendarDescription({ notes: "Only notes" })).toBe("Only notes");
    expect(resolveCalendarDescription({})).toBeUndefined();
  });

  it("resolves locationId place name when locationText is empty", () => {
    const payload = buildCalendarEventPayload(
      proposal({ locationText: null, locationId: "loc1" }),
      names,
    );
    expect(payload!.location).toBe("Tatooine Pad");
    expect(payload!.title).toContain("at Tatooine Pad");
  });

  it("lets locationText override locationId on non-batch", () => {
    const payload = buildCalendarEventPayload(
      proposal({ locationText: "Override Pad", locationId: "loc1" }),
      names,
    );
    expect(payload!.location).toBe("Override Pad");
  });

  it("joins description and notes into DESCRIPTION", () => {
    const payload = buildCalendarEventPayload(
      proposal({ description: "Bring snacks", notes: "Quiet night" }),
      names,
    );
    expect(payload!.description).toBe("Bring snacks\n\nQuiet night");
  });

  it("batch night prefers comment, else description+notes; resolves locationId", () => {
    const batch = proposal({
      isBatchSleeping: true,
      locationText: null,
      description: "Proposal desc",
      notes: "Proposal notes",
      batchEntriesJson: JSON.stringify([
        {
          id: "n1",
          nightDate: "2026-08-01",
          locationId: "loc2",
          comment: "Per-night comment",
          invitees: [{ userId: "u2", role: "required" }],
        },
        {
          id: "n2",
          nightDate: "2026-08-02",
          locationId: "loc1",
          invitees: [{ userId: "u3", role: "required" }],
        },
      ]),
    });
    const payloads = buildCalendarEventPayloads(batch, names, "u1");
    expect(payloads[0]!.location).toBe("Falcon Berth");
    expect(payloads[0]!.description).toBe("Per-night comment");
    expect(payloads[1]!.location).toBe("Tatooine Pad");
    expect(payloads[1]!.description).toBe("Proposal desc\n\nProposal notes");
  });
});
