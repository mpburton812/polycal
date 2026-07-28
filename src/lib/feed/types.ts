import {
  FEED_PROPOSED_ACTIONS,
  FEED_RESOLVED_ACTIONS,
  FEED_VOTE_ACTIONS,
} from "@/lib/feed/prefs-filter";

/**
 * Curated lifecycle + vote actions eligible for Feed milestones (PC-226 / PC-267).
 * Runtime queries use milestoneActionsForPrefs() so Votes can be toggled off.
 * Archived proposals are excluded at load time (PC-232).
 */
export const FEED_MILESTONE_ACTIONS = [
  ...FEED_PROPOSED_ACTIONS,
  ...FEED_RESOLVED_ACTIONS,
  ...FEED_VOTE_ACTIONS,
] as const;

export type FeedMilestoneAction = (typeof FEED_MILESTONE_ACTIONS)[number];

export interface FeedComment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  imageIds: string[];
  canDelete: boolean;
  likeCount: number;
  likedByMe: boolean;
  linkPreview: FeedLinkPreview | null;
}

export interface FeedMilestone {
  id: string;
  proposalId: string;
  proposerId: string;
  action: string;
  headline: string;
  actorName: string | null;
  createdAt: string;
  proposalTitle: string;
  proposalType: "event" | "sleeping" | "fast_sleep";
  proposalState: string;
  masked: boolean;
  /**
   * True when this milestone (and its comments) are visible only because the
   * viewer is an admin — e.g. sleeping arrangements with involved-only network
   * visibility (PC-250).
   */
  visibleViaAdminOnly: boolean;
  /** Admins may soft-delete milestones from the feed (PC-365). */
  canDelete: boolean;
  canComment: boolean;
  comments: FeedComment[];
  likeCount: number;
  likedByMe: boolean;
}

/** Resolved event currently overlapping now and pinned above the Feed (PC-298). */
export interface FeedActiveEvent {
  proposalId: string;
  title: string;
  scheduledStartAt: string;
  scheduledEndAt: string | null;
  proposalState: string;
}

export interface NetworkChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  imageIds: string[];
  canDelete: boolean;
  comments: FeedComment[];
  likeCount: number;
  likedByMe: boolean;
  linkPreview: FeedLinkPreview | null;
}

/** Facebook-style Open Graph card attached to a feed body (PC-279). */
export interface FeedLinkPreview {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  status: "ok" | "failed";
}

export type FeedItem =
  | ({ kind: "milestone" } & FeedMilestone)
  | ({ kind: "chat" } & NetworkChatMessage);

export interface FeedPage {
  items: FeedItem[];
  activeEvents: FeedActiveEvent[];
  nextCursor: string | null;
}
