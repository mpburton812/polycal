import { describe, expect, it } from "vitest";

import {
  viewerCanSeeProposal,
  viewerCanSeeProposalWithSleepingGate,
  viewerCanSeeSleepingProposal,
} from "./access";

describe("proposal access helpers", () => {
  it("allows proposer and invitees to see non-draft proposals", () => {
    expect(
      viewerCanSeeProposal("u1", false, "u1", ["u2"], {
        state: "proposed",
      }),
    ).toBe(true);
    expect(
      viewerCanSeeProposal("u2", false, "u1", ["u2"], {
        state: "proposed",
      }),
    ).toBe(true);
    expect(
      viewerCanSeeProposal("u3", false, "u1", ["u2"], {
        state: "proposed",
      }),
    ).toBe(false);
  });

  it("allows anyone to see resolved proposals (privacy levels removed)", () => {
    expect(
      viewerCanSeeProposal("u9", false, "u1", [], {
        state: "resolved",
      }),
    ).toBe(true);
  });

  it("allows admins to see proposals by default, but not when uninvolved toggle is off", () => {
    expect(
      viewerCanSeeProposal("admin", true, "u1", ["u2"], {
        state: "proposed",
      }),
    ).toBe(true);
    expect(
      viewerCanSeeProposal("admin", true, "u1", ["u2"], {
        state: "proposed",
        adminCanSeeUninvolved: false,
      }),
    ).toBe(false);
    expect(
      viewerCanSeeProposal("admin", true, "u1", ["admin"], {
        state: "proposed",
        adminCanSeeUninvolved: false,
      }),
    ).toBe(true);
  });

  it("involved sleeping visibility hides resolved proposals from non-participants", () => {
    expect(
      viewerCanSeeSleepingProposal("u9", false, "u1", ["u2"], {}),
    ).toBe(false);
    expect(
      viewerCanSeeSleepingProposal("u2", false, "u1", ["u2"], {}),
    ).toBe(true);
    expect(
      viewerCanSeeSleepingProposal("u9", true, "u1", ["u2"], {}),
    ).toBe(true);
  });

  it("sleeping gate hides resolved sleeping proposals from uninvolved viewers", () => {
    expect(
      viewerCanSeeProposalWithSleepingGate("u9", false, "u1", ["u2"], {
        proposalType: "sleeping",
        state: "resolved",
      }),
    ).toBe(false);
    expect(
      viewerCanSeeProposalWithSleepingGate("u2", false, "u1", ["u2"], {
        proposalType: "sleeping",
        state: "resolved",
      }),
    ).toBe(true);
  });

  it("event proposals ignore the sleeping network gate", () => {
    expect(
      viewerCanSeeProposalWithSleepingGate("u9", false, "u1", [], {
        proposalType: "event",
        state: "resolved",
      }),
    ).toBe(true);
  });
});
