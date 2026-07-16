/** Curated lifecycle actions shown as Feed milestones (PC-226). Archived excluded (PC-232). */
export const FEED_MILESTONE_ACTIONS = [
  "proposal.submitted",
  "proposal.auto_resolved",
  "proposal.resolved",
  "proposal.at_risk",
  "proposal.cancelled",
  "proposal.redrafted",
  "proposal.attendees_updated",
  "proposal.admin_fast_add",
  "proposal.admin_rescheduled",
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
  proposalType: "event" | "sleeping";
  proposalState: string;
  masked: boolean;
  canComment: boolean;
  comments: FeedComment[];
  likeCount: number;
  likedByMe: boolean;
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
}

export type FeedItem =
  | ({ kind: "milestone" } & FeedMilestone)
  | ({ kind: "chat" } & NetworkChatMessage);

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}
