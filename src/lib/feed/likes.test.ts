import { describe, expect, it } from "vitest";

import { emptyLikeSummary, FEED_LIKE_TARGET_TYPES } from "@/lib/feed/likes";

describe("feed likes", () => {
  it("exposes the four likeable target types", () => {
    expect(FEED_LIKE_TARGET_TYPES).toEqual([
      "milestone",
      "chat",
      "chat_comment",
      "proposal_comment",
    ]);
  });

  it("starts with zero likes", () => {
    expect(emptyLikeSummary()).toEqual({ likeCount: 0, likedByMe: false });
  });
});
