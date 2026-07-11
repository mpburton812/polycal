import { describe, expect, it } from "vitest";

import {
  formatSleepingDisplayTitle,
  formatSleepingParticipantNames,
  sleepingDisplayStatus,
} from "@/lib/proposals/sleeping-display";

describe("formatSleepingDisplayTitle", () => {
  it("formats solo sleeping with proposer name only", () => {
    expect(
      formatSleepingDisplayTitle({
        proposerName: "Han Solo",
        intentionalSolo: true,
        state: "resolved",
      }),
    ).toBe("Sleeping: Han Solo, Confirmed");
  });

  it("formats multi-participant sleeping with location inline (PC-150)", () => {
    expect(
      formatSleepingDisplayTitle({
        proposerName: "Leia Organa",
        inviteeNames: ["Han Solo"],
        locationName: "Millennium Falcon",
        state: "proposed",
      }),
    ).toBe("Sleeping: Leia Organa, Han Solo, Tentative, at Millennium Falcon");
  });

  it("uses Proposed status for drafts", () => {
    expect(sleepingDisplayStatus({ state: "draft" })).toBe("Proposed");
  });

  it("uses At risk when flagged", () => {
    expect(sleepingDisplayStatus({ state: "resolved", atRisk: true })).toBe("At risk");
  });

  it("deduplicates participant names", () => {
    expect(
      formatSleepingParticipantNames({
        proposerName: "A",
        inviteeNames: ["A", "B"],
      }),
    ).toEqual(["A", "B"]);
  });
});
