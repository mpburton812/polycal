import type { FeedItem } from "@/lib/feed/types";

/**
 * Builds a compact token for the first-page feed head so clients can skip
 * full reloads when nothing changed (PC-239 silent poll).
 */
export function buildFeedUpdateToken(items: FeedItem[]): string {
  return items
    .map((item) => {
      const commentPart = item.comments
        .map((c) => `${c.id}:${c.likeCount}:${c.likedByMe ? 1 : 0}`)
        .join(",");
      return [
        item.kind,
        item.id,
        item.createdAt,
        String(item.likeCount),
        item.likedByMe ? "1" : "0",
        String(item.comments.length),
        commentPart,
      ].join(":");
    })
    .join("|");
}
