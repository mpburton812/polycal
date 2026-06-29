import { describe, expect, it } from "vitest";

import {
  getProposalSpecialKind,
  isNonScheduleProposal,
  parseGroupNameProposalMeta,
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
    });
    expect(getProposalSpecialKind(json)).toBe("residency");
    expect(isNonScheduleProposal(json)).toBe(true);
  });

  it("parses group name metadata", () => {
    const json = JSON.stringify({
      groupNameProposal: true,
      proposedName: "New Name",
      previousName: "Old Name",
    });
    expect(parseGroupNameProposalMeta(json)).toEqual({
      groupNameProposal: true,
      proposedName: "New Name",
      previousName: "Old Name",
    });
    expect(getProposalSpecialKind(json)).toBe("group_name");
  });

  it("returns null for regular descriptions", () => {
    expect(parseResidencyProposalMeta("plain text")).toBeNull();
    expect(getProposalSpecialKind(null)).toBeNull();
    expect(isNonScheduleProposal(null)).toBe(false);
  });

  it("formats group rename and hides residency JSON for display", () => {
    const residencyJson = serializeResidencyProposalMeta({
      residencyProposal: true,
      targetUserId: "user-1",
    });
    expect(proposalDescriptionForDisplay(residencyJson)).toBeNull();
    expect(
      proposalDescriptionForDisplay(
        JSON.stringify({
          groupNameProposal: true,
          proposedName: "New Name",
          previousName: "Old Name",
        }),
      ),
    ).toBe('Rename to "New Name" (from "Old Name")');
    expect(proposalDescriptionForDisplay("A regular note")).toBe("A regular note");
  });
});
