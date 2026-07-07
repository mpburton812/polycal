import { describe, expect, it } from "vitest";

import { shouldRecordProposalInviteeView } from "./invitee-view";

describe("shouldRecordProposalInviteeView", () => {
  it("records for unmasked invitees on proposed or resolved proposals", () => {
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "proposed",
        masked: false,
        isInvitee: true,
        viewedAt: null,
      }),
    ).toBe(true);
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "resolved",
        masked: false,
        isInvitee: true,
        viewedAt: null,
      }),
    ).toBe(true);
  });

  it("skips when already viewed, masked, not invitee, or non-active states", () => {
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "proposed",
        masked: false,
        isInvitee: true,
        viewedAt: "2026-06-01T00:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "proposed",
        masked: true,
        isInvitee: true,
        viewedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "proposed",
        masked: false,
        isInvitee: false,
        viewedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "draft",
        masked: false,
        isInvitee: true,
        viewedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldRecordProposalInviteeView({
        proposalState: "archived",
        masked: false,
        isInvitee: true,
        viewedAt: null,
      }),
    ).toBe(false);
  });
});
