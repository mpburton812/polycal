import type { FeedPrefs } from "@/types/feed-prefs";
import {
  FEED_PROPOSED_ACTIONS,
  FEED_RESOLVED_ACTIONS,
  FEED_VOTE_ACTIONS,
  contentKindForMilestoneAction,
  type FeedMilestoneContentKind,
} from "@/lib/proposals/services/transition-catalog";

// Re-export the transition→feed-kind catalog (source of truth lives beside the
// state-log writer) so existing Feed imports keep a stable path (PC-323).
export {
  FEED_PROPOSED_ACTIONS,
  FEED_RESOLVED_ACTIONS,
  FEED_VOTE_ACTIONS,
  contentKindForMilestoneAction,
};
export type { FeedMilestoneContentKind };

/**
 * State-log actions to query for the given prefs (PC-266 / PC-267).
 */
export function milestoneActionsForPrefs(prefs: FeedPrefs): string[] {
  const actions: string[] = [];
  if (prefs.content.proposed) actions.push(...FEED_PROPOSED_ACTIONS);
  if (prefs.content.votes) actions.push(...FEED_VOTE_ACTIONS);
  if (prefs.content.resolved) actions.push(...FEED_RESOLVED_ACTIONS);
  return actions;
}

/**
 * Classifies a proposal milestone into exclusive involvement buckets (PC-266).
 */
export function classifyMilestoneInvolvement(
  viewerId: string,
  proposerId: string,
  inviteeUserIds: string[],
  acceptedPartnerIds: ReadonlySet<string>,
): "myself" | "partners" | "network" {
  if (proposerId === viewerId || inviteeUserIds.includes(viewerId)) {
    return "myself";
  }
  if (
    acceptedPartnerIds.has(proposerId) ||
    inviteeUserIds.some((id) => acceptedPartnerIds.has(id))
  ) {
    return "partners";
  }
  return "network";
}

/**
 * Classifies a chat message by author relationship (PC-266).
 */
export function classifyChatInvolvement(
  viewerId: string,
  authorId: string,
  acceptedPartnerIds: ReadonlySet<string>,
): "myself" | "partners" | "network" {
  if (authorId === viewerId) return "myself";
  if (acceptedPartnerIds.has(authorId)) return "partners";
  return "network";
}

/**
 * True when the involvement bucket is enabled in prefs.
 */
export function involvementAllowed(
  prefs: FeedPrefs,
  bucket: "myself" | "partners" | "network",
): boolean {
  return prefs.involvement[bucket];
}

/**
 * True when chat messages should appear given prefs.
 */
export function networkChatAllowed(prefs: FeedPrefs): boolean {
  return prefs.content.messages && prefs.messagesInclude.networkChat;
}

/**
 * True when proposal-thread comments should attach to milestones.
 */
export function proposalCommentsAllowed(prefs: FeedPrefs): boolean {
  return prefs.content.messages && prefs.messagesInclude.proposalComments;
}
