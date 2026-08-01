import { describe, expect, it } from "vitest";

import {
  formatSleepingDisplayTitle,
  formatSleepingParticipantNames,
  sleepingDisplayStatus,
  stripConfirmedFromSleepingTitle,
} from "@/lib/proposals/sleeping-display";

describe("formatSleepingDisplayTitle", () => {
  it("formats solo sleeping without Confirmed when resolved (PC-351)", () => {
    expect(
      formatSleepingDisplayTitle({
        proposerName: "Han Solo",
        intentionalSolo: true,
        state: "resolved",
      }),
    ).toBe("Sleeping: Han Solo");
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

  it("omits Confirmed when resolved but keeps at Location (PC-351)", () => {
    expect(
      formatSleepingDisplayTitle({
        proposerName: "Leia Organa",
        inviteeNames: ["Han Solo"],
        locationName: "Millennium Falcon",
        state: "resolved",
      }),
    ).toBe("Sleeping: Leia Organa, Han Solo, at Millennium Falcon");
  });

  it("uses Proposed status for drafts", () => {
    expect(sleepingDisplayStatus({ state: "draft" })).toBe("Proposed");
  });

  it("returns null status when resolved (PC-351)", () => {
    expect(sleepingDisplayStatus({ state: "resolved" })).toBeNull();
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

  it("strips Confirmed from legacy titles without removing location", () => {
    expect(
      stripConfirmedFromSleepingTitle(
        "Sleeping: Morgan B., Doc KT, Confirmed, at Katie's Swingin' Pad",
      ),
    ).toBe("Sleeping: Morgan B., Doc KT, at Katie's Swingin' Pad");
    expect(stripConfirmedFromSleepingTitle("Sleeping: Han Solo, Confirmed")).toBe(
      "Sleeping: Han Solo",
    );
  });
});
