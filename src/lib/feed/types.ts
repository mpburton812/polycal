/** Curated lifecycle actions shown as Feed milestones (PC-226). */
export const FEED_MILESTONE_ACTIONS = [
  "proposal.submitted",
  "proposal.auto_resolved",
  "proposal.resolved",
  "proposal.at_risk",
  "proposal.cancelled",
  "proposal.archived",
  "proposal.redrafted",
  "proposal.attendees_updated",
  "proposal.admin_fast_add",
  "proposal.admin_rescheduled",
] as const;

export type FeedMilestoneAction = (typeof FEED_MILESTONE_ACTIONS)[number];

export interface FeedMilestoneComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface FeedMilestone {
  id: string;
  proposalId: string;
  action: string;
  headline: string;
  actorName: string | null;
  createdAt: string;
  proposalTitle: string;
  proposalType: "event" | "sleeping";
  proposalState: string;
  masked: boolean;
  canComment: boolean;
  recentComments: FeedMilestoneComment[];
}

export interface NetworkChatMessage {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
}
