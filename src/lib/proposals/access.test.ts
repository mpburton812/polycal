import { describe, expect, it } from "vitest";

import {
  MASKED_TITLE,
  canViewProposalContent,
  viewerCanSeeFeedMilestoneAudit,
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

  it("exports Busy as the masked title constant", () => {
    expect(MASKED_TITLE).toBe("Busy");
  });

  it("canViewProposalContent omits uninvolved non-admins from sleeping proposals", () => {
    expect(
      canViewProposalContent({
        viewerId: "u9",
        isAdmin: false,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        state: "resolved",
      }),
    ).toEqual({ visible: false, contentMasked: false, isPartnerOnlySleeping: false });
  });

  it("canViewProposalContent masks sleeping for uninvolved admins when schedule mask is on", () => {
    expect(
      canViewProposalContent({
        viewerId: "admin",
        isAdmin: true,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        state: "resolved",
        adminCanSeeUninvolved: true,
        applyScheduleMask: true,
        hideSleeping: true,
        acceptedPartnerIds: new Set(),
      }),
    ).toEqual({ visible: true, contentMasked: true, isPartnerOnlySleeping: false });
  });

  it("canViewProposalContent does not mask when schedule mask is off (feed/board)", () => {
    expect(
      canViewProposalContent({
        viewerId: "admin",
        isAdmin: true,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        state: "resolved",
        applyScheduleMask: false,
        hideSleeping: true,
        acceptedPartnerIds: new Set(),
      }),
    ).toEqual({ visible: true, contentMasked: false, isPartnerOnlySleeping: false });
  });

  it("canViewProposalContent does not mask partners of participants", () => {
    expect(
      canViewProposalContent({
        viewerId: "partner",
        isAdmin: true,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        applyScheduleMask: true,
        hideSleeping: true,
        acceptedPartnerIds: new Set(["u1"]),
      }),
    ).toEqual({ visible: true, contentMasked: false, isPartnerOnlySleeping: false });
  });

  it("partner sleeping toggle shows partner-only nights when ON (PC-366)", () => {
    expect(
      viewerCanSeeSleepingProposal("partner", false, "u1", ["u2"], {
        seePartnersSleepingArrangements: true,
        acceptedPartnerIds: new Set(["u1"]),
      }),
    ).toBe(true);
    expect(
      canViewProposalContent({
        viewerId: "partner",
        isAdmin: false,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        state: "resolved",
        seePartnersSleepingArrangements: true,
        acceptedPartnerIds: new Set(["u1"]),
      }),
    ).toEqual({ visible: true, contentMasked: false, isPartnerOnlySleeping: true });
  });

  it("partner sleeping toggle stays involved-only when OFF (PC-366)", () => {
    expect(
      viewerCanSeeSleepingProposal("partner", false, "u1", ["u2"], {
        seePartnersSleepingArrangements: false,
        acceptedPartnerIds: new Set(["u1"]),
      }),
    ).toBe(false);
    expect(
      canViewProposalContent({
        viewerId: "partner",
        isAdmin: false,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        state: "resolved",
        seePartnersSleepingArrangements: false,
        acceptedPartnerIds: new Set(["u1"]),
      }),
    ).toEqual({ visible: false, contentMasked: false, isPartnerOnlySleeping: false });
  });

  it("involved viewers are not partner-only even when toggle is ON (PC-366)", () => {
    expect(
      canViewProposalContent({
        viewerId: "u2",
        isAdmin: false,
        proposerId: "u1",
        inviteeUserIds: ["u2"],
        proposalType: "sleeping",
        state: "resolved",
        seePartnersSleepingArrangements: true,
        acceptedPartnerIds: new Set(["u1"]),
      }),
    ).toEqual({ visible: true, contentMasked: false, isPartnerOnlySleeping: false });
  });
});

describe("viewerCanSeeFeedMilestoneAudit", () => {
  it("shows FastSleep auto_resolved to proposer/invitee under admin_only (PC-378)", () => {
    expect(
      viewerCanSeeFeedMilestoneAudit(
        "proposal.auto_resolved",
        "admin_only",
        false,
        true,
        false,
      ),
    ).toBe(true);
    expect(
      viewerCanSeeFeedMilestoneAudit(
        "proposal.auto_resolved",
        "admin_only",
        false,
        false,
        true,
      ),
    ).toBe(true);
    expect(
      viewerCanSeeFeedMilestoneAudit(
        "proposal.auto_resolved",
        "admin_only",
        false,
        false,
        false,
      ),
    ).toBe(false);
  });

  it("keeps admin_only for ordinary resolved milestones", () => {
    expect(
      viewerCanSeeFeedMilestoneAudit("proposal.resolved", "admin_only", false, true, false),
    ).toBe(false);
    expect(
      viewerCanSeeFeedMilestoneAudit("proposal.resolved", "admin_only", true, false, false),
    ).toBe(true);
  });
});
