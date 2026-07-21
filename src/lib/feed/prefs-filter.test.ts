import { describe, expect, it } from "vitest";

import {
  classifyChatInvolvement,
  classifyMilestoneInvolvement,
  contentKindForMilestoneAction,
  milestoneActionsForPrefs,
  networkChatAllowed,
} from "./prefs-filter";
import { DEFAULT_FEED_PREFS, detectPresetId, parseFeedPrefs, prefsForPreset } from "@/types/feed-prefs";

describe("feed prefs", () => {
  it("defaults to everything", () => {
    expect(parseFeedPrefs(null).presetId).toBe("everything");
    expect(parseFeedPrefs("{}").involvement.myself).toBe(true);
  });

  it("detects named presets", () => {
    const partners = prefsForPreset("partners_circle");
    expect(detectPresetId(partners)).toBe("partners_circle");
  });

  it("marks mismatched prefs as custom", () => {
    expect(
      detectPresetId({
        involvement: { myself: true, partners: false, network: true },
        content: DEFAULT_FEED_PREFS.content,
        messagesInclude: DEFAULT_FEED_PREFS.messagesInclude,
      }),
    ).toBe("custom");
  });
});

describe("prefs-filter", () => {
  it("maps actions to content kinds", () => {
    expect(contentKindForMilestoneAction("proposal.submitted")).toBe("proposed");
    expect(contentKindForMilestoneAction("proposal.vote_cast")).toBe("votes");
    expect(contentKindForMilestoneAction("proposal.resolved")).toBe("resolved");
    expect(contentKindForMilestoneAction("proposal.comment_added")).toBeNull();
  });

  it("includes vote actions only when Votes is on", () => {
    const withVotes = milestoneActionsForPrefs(DEFAULT_FEED_PREFS);
    expect(withVotes).toContain("proposal.vote_cast");
    const noVotes = milestoneActionsForPrefs({
      ...DEFAULT_FEED_PREFS,
      content: { ...DEFAULT_FEED_PREFS.content, votes: false },
    });
    expect(noVotes).not.toContain("proposal.vote_cast");
  });

  it("classifies involvement buckets", () => {
    const partners = new Set(["p1"]);
    expect(classifyMilestoneInvolvement("me", "me", [], partners)).toBe("myself");
    expect(classifyMilestoneInvolvement("me", "other", ["p1"], partners)).toBe("partners");
    expect(classifyMilestoneInvolvement("me", "other", ["x"], partners)).toBe("network");
    expect(classifyChatInvolvement("me", "me", partners)).toBe("myself");
    expect(classifyChatInvolvement("me", "p1", partners)).toBe("partners");
  });

  it("gates network chat on messages prefs", () => {
    expect(networkChatAllowed(DEFAULT_FEED_PREFS)).toBe(true);
    expect(
      networkChatAllowed({
        ...DEFAULT_FEED_PREFS,
        content: { ...DEFAULT_FEED_PREFS.content, messages: false },
      }),
    ).toBe(false);
  });
});
