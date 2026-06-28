import { describe, expect, it } from "vitest";

import {
  applyProposalMask,
  shouldMaskProposalContent,
  viewerCanSeeProposal,
} from "./access";

describe("proposal access helpers", () => {
  it("allows proposer and invitees to see non-draft proposals", () => {
    expect(
      viewerCanSeeProposal("u1", false, "u1", ["u2"], {
        state: "proposed",
        eventPrivacy: "private",
      }),
    ).toBe(true);
    expect(
      viewerCanSeeProposal("u2", false, "u1", ["u2"], {
        state: "proposed",
        eventPrivacy: "private",
      }),
    ).toBe(true);
    expect(
      viewerCanSeeProposal("u3", false, "u1", ["u2"], {
        state: "proposed",
        eventPrivacy: "private",
      }),
    ).toBe(false);
  });

  it("allows anyone to see open resolved proposals", () => {
    expect(
      viewerCanSeeProposal("u9", false, "u1", [], {
        state: "resolved",
        eventPrivacy: "open",
      }),
    ).toBe(true);
  });

  it("masks private resolved content for non-participants", () => {
    expect(
      shouldMaskProposalContent("u3", false, "u1", ["u2"], "private", false, false, "resolved"),
    ).toBe(true);
    expect(
      shouldMaskProposalContent("u2", false, "u1", ["u2"], "private", false, false, "resolved"),
    ).toBe(false);
  });

  it("applyProposalMask redacts fields when masked", () => {
    const masked = applyProposalMask(
      {
        title: "Secret dinner",
        description: "details",
        locationName: "Home",
        scheduledStartAt: "2026-01-01T00:00:00.000Z",
        scheduledEndAt: "2026-01-01T01:00:00.000Z",
      },
      true,
    );
    expect(masked.title).toBe("Private event");
    expect(masked.locationName).toBeNull();
    expect(masked.scheduledStartAt).toBeNull();
  });
});
