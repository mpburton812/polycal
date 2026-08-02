export const alphaFeedbackKinds = ["bug", "feature"] as const;
export type AlphaFeedbackKind = (typeof alphaFeedbackKinds)[number];

export const alphaFeedbackStatuses = [
  "not_started",
  "in_progress",
  "ready_for_testing",
  "deferred",
  "working_as_designed",
  "closed",
] as const;
export type AlphaFeedbackStatus = (typeof alphaFeedbackStatuses)[number];

export const proposalStates = ["draft", "proposed", "resolved", "archived"] as const;
export type ProposalState = (typeof proposalStates)[number];

export const proposalTypes = ["event", "sleeping", "fast_sleep"] as const;
export type ProposalType = (typeof proposalTypes)[number];

export const inviteeRoles = ["required", "optional"] as const;
export type InviteeRole = (typeof inviteeRoles)[number];

export const inviteeVoteStatuses = [
  "not_seen",
  "accept",
  "abstain",
  "decline",
  "accept_suboptimal",
] as const;
export type InviteeVoteStatus = (typeof inviteeVoteStatuses)[number];

/** Privacy levels were removed (PC-280) — every proposal is "open"; column kept for migration backfill. */
export const eventPrivacyLevels = ["open"] as const;
export type EventPrivacyLevel = (typeof eventPrivacyLevels)[number];

export const feedLikeTargetTypes = [
  "milestone",
  "chat",
  "chat_comment",
  "proposal_comment",
] as const;
export type FeedLikeTargetType = (typeof feedLikeTargetTypes)[number];
