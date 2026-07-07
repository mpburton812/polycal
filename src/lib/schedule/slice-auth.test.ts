import { describe, expect, it } from "vitest";

import {
  applyScheduleMasking,
  canCommentOnProposal,
  validateSliceMembership,
  validateSliceTagForProposal,
  validateSliceTagValue,
} from "./slice-auth";

describe("slice-auth", () => {
  const parent = {
    id: "prop-1",
    isBatchSleeping: false,
    isAllDay: true,
    scheduledStartAt: "2026-07-01T00:00:00.000Z",
    scheduledEndAt: "2026-07-03T23:59:59.999Z",
  };

  const spanSlots = [
    {
      id: "slot-1",
      startAt: "2026-07-01T00:00:00.000Z",
      endAt: "2026-07-03T23:59:59.999Z",
      isDetached: false,
    },
  ];

  it("rejects virtual_span_day keys outside the parent span", () => {
    const result = validateSliceMembership(parent, spanSlots, "virtual_span_day", "2026-07-10");
    expect(result.ok).toBe(false);
  });

  it("accepts virtual_span_day keys inside the parent span", () => {
    const result = validateSliceMembership(parent, spanSlots, "virtual_span_day", "2026-07-02");
    expect(result.ok).toBe(true);
  });

  it("masks sleeping for non-participants when hideSleeping is enabled", () => {
    const result = applyScheduleMasking({
      viewerId: "viewer-1",
      isAdmin: false,
      proposerId: "proposer-1",
      inviteeUserIds: ["invitee-1"],
      eventPrivacy: "open",
      proposalState: "resolved",
      proposalType: "sleeping",
      privacyFlags: {
        adminCanSeePrivate: false,
        adminCanSeeSuperPrivate: false,
        hideSleeping: true,
      },
      acceptedPartnerIds: new Set(),
    });
    expect(result.sleepingMasked).toBe(true);
    expect(result.isContentMasked).toBe(true);
  });

  it("does not allow comments on archived proposals", () => {
    const allowed = canCommentOnProposal({
      viewerId: "user-1",
      isAdmin: false,
      proposerId: "user-1",
      inviteeUserIds: [],
      eventPrivacy: "open",
      state: "archived",
      isContentMasked: false,
    });
    expect(allowed).toBe(false);
  });

  it("validates slice tag format", () => {
    expect(validateSliceTagValue("day:2026-07-02")).toBe(true);
    expect(validateSliceTagValue("slot:pts-abc")).toBe(true);
    expect(validateSliceTagValue("bogus")).toBe(false);
  });

  it("rejects slice tags that do not match span membership", () => {
    const result = validateSliceTagForProposal(
      parent,
      spanSlots,
      "virtual_span_day",
      "2026-07-02",
      "day:2026-07-10",
    );
    expect(result.ok).toBe(false);
  });
});
