import { describe, expect, it } from "vitest";

import { placeQualifiesForProposalPicker } from "./picker-eligibility";

describe("placeQualifiesForProposalPicker (PC-420)", () => {
  const members = new Set(["alice", "bob"]);

  it("keeps a place the viewer just created even with no residents", () => {
    expect(
      placeQualifiesForProposalPicker({
        createdById: "alice",
        viewerId: "alice",
        acceptedResidentIds: [],
        activeMemberIds: members,
      }),
    ).toBe(true);
  });

  it("keeps a place with an accepted resident who is an active member", () => {
    expect(
      placeQualifiesForProposalPicker({
        createdById: "carol",
        viewerId: "alice",
        acceptedResidentIds: ["bob"],
        activeMemberIds: members,
      }),
    ).toBe(true);
  });

  it("drops an orphan named after a departed user with no current members", () => {
    expect(
      placeQualifiesForProposalPicker({
        createdById: "dozer",
        viewerId: "alice",
        acceptedResidentIds: ["dozer"],
        activeMemberIds: members,
      }),
    ).toBe(false);
  });

  it("drops a zero-resident leftover the viewer did not create", () => {
    expect(
      placeQualifiesForProposalPicker({
        createdById: "dozer",
        viewerId: "alice",
        acceptedResidentIds: [],
        activeMemberIds: members,
      }),
    ).toBe(false);
  });
});
