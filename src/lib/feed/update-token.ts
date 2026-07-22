import type { FeedActiveEvent, FeedItem } from "@/lib/feed/types";

/**
 * Builds a compact token for the first-page Feed head and active-event pins.
 * Including pin timing/state lets silent polling refresh when an event enters,
 * leaves, or changes within the highlighted stack (PC-239 / PC-298).
 */
export function buildFeedUpdateToken(
  items: FeedItem[],
  activeEvents: FeedActiveEvent[],
): string {
  const itemToken = items
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

  const activeEventToken = activeEvents
    .map((event) =>
      [
        event.proposalId,
        event.title,
        event.scheduledStartAt,
        event.scheduledEndAt ?? "",
        event.proposalState,
      ].join(":"),
    )
    .join("|");

  return `${itemToken}#active:${activeEventToken}`;
}
