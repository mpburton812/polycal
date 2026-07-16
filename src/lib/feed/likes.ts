/** Likeable feed targets (PC-239). */
export const FEED_LIKE_TARGET_TYPES = [
  "milestone",
  "chat",
  "chat_comment",
  "proposal_comment",
] as const;

export type FeedLikeTargetType = (typeof FEED_LIKE_TARGET_TYPES)[number];

export interface FeedLikeSummary {
  likeCount: number;
  likedByMe: boolean;
}

export interface FeedLiker {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  likedAt: string;
}

export function emptyLikeSummary(): FeedLikeSummary {
  return { likeCount: 0, likedByMe: false };
}
