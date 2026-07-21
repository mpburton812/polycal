import type { FeedPrefs } from "@/types/feed-prefs";

/** Core lifecycle actions always eligible for Proposed / Resolved rows (PC-266). */
export const FEED_PROPOSED_ACTIONS = [
  "proposal.submitted",
  "proposal.redrafted",
  "proposal.attendees_updated",
  "proposal.admin_fast_add",
] as const;

export const FEED_RESOLVED_ACTIONS = [
  "proposal.resolved",
  "proposal.auto_resolved",
  "proposal.cancelled",
  "proposal.at_risk",
  "proposal.admin_rescheduled",
] as const;

/** Vote milestones — gated by Votes content pref (PC-267). */
export const FEED_VOTE_ACTIONS = [
  "proposal.vote_cast",
  "proposal.slot_vote_cast",
  "proposal.passive_proxy_vote",
] as const;

export type FeedMilestoneContentKind = "proposed" | "votes" | "resolved";

/**
 * Maps a state-log action to a feed content kind, or null if not a feed milestone.
 */
export function contentKindForMilestoneAction(action: string): FeedMilestoneContentKind | null {
  if ((FEED_PROPOSED_ACTIONS as readonly string[]).includes(action)) return "proposed";
  if ((FEED_VOTE_ACTIONS as readonly string[]).includes(action)) return "votes";
  if ((FEED_RESOLVED_ACTIONS as readonly string[]).includes(action)) return "resolved";
  return null;
}

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
