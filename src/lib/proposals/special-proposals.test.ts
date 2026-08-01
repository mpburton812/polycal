import { describe, expect, it } from "vitest";

import {
  getProposalSpecialKind,
  isNonScheduleProposal,
  parseResidencyProposalMeta,
  proposalDescriptionForDisplay,
  serializeResidencyProposalMeta,
} from "@/lib/proposals/special-proposals";

describe("special-proposals metadata", () => {
  it("parses residency metadata", () => {
    const json = serializeResidencyProposalMeta({
      residencyProposal: true,
      targetUserId: "user-1",
    });
    expect(parseResidencyProposalMeta(json)).toEqual({
      residencyProposal: true,
      targetUserId: "user-1",
      locationResidentsId: undefined,
      kind: undefined,
      placeRole: undefined,
    });
    expect(getProposalSpecialKind(json)).toBe("residency");
    expect(isNonScheduleProposal(json)).toBe(true);
  });

  it("returns null for regular descriptions", () => {
    expect(parseResidencyProposalMeta("plain text")).toBeNull();
    expect(getProposalSpecialKind(null)).toBeNull();
    expect(isNonScheduleProposal(null)).toBe(false);
  });

  it("formats residency role for display", () => {
    const residencyJson = serializeResidencyProposalMeta({
      residencyProposal: true,
      targetUserId: "user-1",
      placeRole: "resident",
    });
    expect(proposalDescriptionForDisplay(residencyJson)).toBe(
      "Requesting Resident access — can use the place but cannot manage membership.",
    );
    const ownerJson = serializeResidencyProposalMeta({
      residencyProposal: true,
      targetUserId: "user-1",
      placeRole: "owner",
    });
    expect(proposalDescriptionForDisplay(ownerJson)).toBe(
      "Requesting Owner access — can manage members and approve residency requests.",
    );
    expect(proposalDescriptionForDisplay("A regular note")).toBe("A regular note");
  });
});
