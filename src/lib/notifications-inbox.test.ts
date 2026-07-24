import { describe, expect, it } from "vitest";

import {
  INBOX_EXCLUDED_NOTIFICATION_TYPES,
  isActionableProposalNotification,
  isPartnershipStillActionable,
  isProposalVoteStillActionable,
  proposalIdFromNotificationMetadata,
} from "./notifications-inbox";

describe("INBOX_EXCLUDED_NOTIFICATION_TYPES", () => {
  it("excludes push/email delivery telemetry from the user inbox", () => {
    expect(INBOX_EXCLUDED_NOTIFICATION_TYPES.has("push_sent")).toBe(true);
    expect(INBOX_EXCLUDED_NOTIFICATION_TYPES.has("email_failed")).toBe(true);
    expect(INBOX_EXCLUDED_NOTIFICATION_TYPES.has("proposal_submitted")).toBe(false);
  });
});

describe("isActionableProposalNotification", () => {
  it("treats proposal_submitted as actionable", () => {
    expect(isActionableProposalNotification("proposal_submitted", { proposalId: "p1" })).toBe(
      true,
    );
  });

  it("treats metadata.action === vote as actionable", () => {
    expect(
      isActionableProposalNotification("proposal_invite", {
        action: "vote",
        proposalId: "p1",
      }),
    ).toBe(true);
  });

  it("treats proposal_attendee_update as actionable", () => {
    expect(
      isActionableProposalNotification("proposal_attendee_update", { proposalId: "p1" }),
    ).toBe(true);
  });

  it("does not clear proposal_resolved informational notices", () => {
    expect(
      isActionableProposalNotification("proposal_resolved", { proposalId: "p1" }),
    ).toBe(false);
  });

  it("clears proposal_resolved when metadata.action is vote (optional RSVP)", () => {
    expect(
      isActionableProposalNotification("proposal_resolved", {
        proposalId: "p1",
        action: "vote",
      }),
    ).toBe(true);
  });

  it("does not treat others' proposal_vote_cast as actionable for the recipient", () => {
    expect(
      isActionableProposalNotification("proposal_vote_cast", {
        proposalId: "p1",
        voterId: "someone-else",
      }),
    ).toBe(false);
  });

  it("excludes delivery telemetry types even with vote metadata", () => {
    expect(
      isActionableProposalNotification("push_sent", { action: "vote", proposalId: "p1" }),
    ).toBe(false);
  });
});

describe("proposalIdFromNotificationMetadata", () => {
  it("returns proposalId when present as a string", () => {
    expect(proposalIdFromNotificationMetadata({ proposalId: "abc" })).toBe("abc");
  });

  it("returns null when proposalId is missing or non-string", () => {
    expect(proposalIdFromNotificationMetadata({})).toBeNull();
    expect(proposalIdFromNotificationMetadata({ proposalId: 12 })).toBeNull();
  });
});

describe("isPartnershipStillActionable", () => {
  it("is actionable only while proposed", () => {
    expect(isPartnershipStillActionable("proposed")).toBe(true);
    expect(isPartnershipStillActionable("accepted")).toBe(false);
    expect(isPartnershipStillActionable(null)).toBe(false);
  });
});

describe("isProposalVoteStillActionable", () => {
  it("requires not_seen vote on a proposed proposal", () => {
    expect(
      isProposalVoteStillActionable({
        proposalState: "proposed",
        voteStatus: "not_seen",
      }),
    ).toBe(true);
    expect(
      isProposalVoteStillActionable({
        proposalState: "proposed",
        voteStatus: "accept",
      }),
    ).toBe(false);
  });
});
