import { describe, expect, it } from "vitest";

import { buildFeedUpdateToken } from "@/lib/feed/update-token";
import type { FeedItem } from "@/lib/feed/types";

function chatItem(overrides: Partial<FeedItem & { kind: "chat" }> = {}): FeedItem {
  return {
    kind: "chat",
    id: "c1",
    authorId: "u1",
    authorName: "Luke",
    body: "hi",
    createdAt: "2026-07-16T12:00:00.000Z",
    imageIds: [],
    canDelete: true,
    comments: [],
    likeCount: 0,
    likedByMe: false,
    ...overrides,
  };
}

describe("buildFeedUpdateToken", () => {
  it("is stable for identical heads", () => {
    const items = [chatItem()];
    expect(buildFeedUpdateToken(items)).toBe(buildFeedUpdateToken(items));
  });

  it("changes when like counts change", () => {
    const before = buildFeedUpdateToken([chatItem({ likeCount: 0 })]);
    const after = buildFeedUpdateToken([chatItem({ likeCount: 1, likedByMe: true })]);
    expect(before).not.toBe(after);
  });

  it("changes when a comment is added", () => {
    const before = buildFeedUpdateToken([chatItem()]);
    const after = buildFeedUpdateToken([
      chatItem({
        comments: [
          {
            id: "cc1",
            authorId: "u2",
            authorName: "Leia",
            body: "yo",
            createdAt: "2026-07-16T12:01:00.000Z",
            imageIds: [],
            canDelete: false,
            likeCount: 0,
            likedByMe: false,
          },
        ],
      }),
    ]);
    expect(before).not.toBe(after);
  });

  it("changes when the newest item id changes", () => {
    const before = buildFeedUpdateToken([chatItem({ id: "c1" })]);
    const after = buildFeedUpdateToken([chatItem({ id: "c2" })]);
    expect(before).not.toBe(after);
  });
});
