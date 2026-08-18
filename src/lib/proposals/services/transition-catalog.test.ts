import { describe, expect, it } from "vitest";

import {
  FEED_PROPOSED_ACTIONS,
  FEED_RESOLVED_ACTIONS,
  FEED_VOTE_ACTIONS,
  contentKindForMilestoneAction,
} from "./transition-catalog";

describe("transition-catalog", () => {
  it("maps every proposed action to the proposed kind", () => {
    for (const action of FEED_PROPOSED_ACTIONS) {
      expect(contentKindForMilestoneAction(action)).toBe("proposed");
    }
  });

  it("maps every vote action to the votes kind", () => {
    for (const action of FEED_VOTE_ACTIONS) {
      expect(contentKindForMilestoneAction(action)).toBe("votes");
    }
  });

  it("includes posted_to_feed as a resolved Feed action (PC-430)", () => {
    expect(FEED_RESOLVED_ACTIONS).toContain("proposal.posted_to_feed");
    expect(contentKindForMilestoneAction("proposal.posted_to_feed")).toBe("resolved");
  });

  it("returns null for actions outside the allowlist", () => {
    expect(contentKindForMilestoneAction("proposal.comment_added")).toBeNull();
    expect(contentKindForMilestoneAction("proposal.child_detached")).toBeNull();
    expect(contentKindForMilestoneAction("draft.created")).toBeNull();
    expect(contentKindForMilestoneAction("")).toBeNull();
  });

  it("keeps the three allowlists disjoint (each action has exactly one kind)", () => {
    const all = [
      ...FEED_PROPOSED_ACTIONS,
      ...FEED_RESOLVED_ACTIONS,
      ...FEED_VOTE_ACTIONS,
    ];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });

  it("classifies every catalogued action to a non-null kind (completeness)", () => {
    const all = [
      ...FEED_PROPOSED_ACTIONS,
      ...FEED_RESOLVED_ACTIONS,
      ...FEED_VOTE_ACTIONS,
    ];
    for (const action of all) {
      expect(contentKindForMilestoneAction(action)).not.toBeNull();
    }
  });
});
