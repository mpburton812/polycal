/**
 * Typed catalog mapping proposal state-log transition actions to Feed content
 * kinds (PC-323). This lives beside {@link ./state-log} — the single writer of
 * transition rows — so the set of actions that surface in the Feed is defined
 * next to the set of actions that can be written.
 *
 * IMPORTANT: this is an allowlist. Adding an action here makes it eligible to
 * appear in the Feed, so keep it in lockstep with intended Feed behavior and do
 * not widen it casually. `src/lib/feed/prefs-filter.ts` re-exports these so Feed
 * code keeps a stable import path while the source of truth lives here.
 */

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
  "proposal.posted_to_feed",
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
