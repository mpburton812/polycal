import type { InviteeRole, InviteeVoteStatus, ProposalState } from "@/lib/db/schema";

/**
 * True when an optional invitee still owes an RSVP after required attendees resolved (PC-278 / PC-49).
 * Applies to polls and non-polls; voting UI still routes polls to slot votes separately.
 */
export function optionalInviteeVotesPending(
  proposal: { state: ProposalState },
  invitee: { role: InviteeRole; voteStatus: InviteeVoteStatus } | undefined,
): boolean {
  return (
    proposal.state === "resolved" &&
    invitee?.role === "optional" &&
    invitee.voteStatus === "not_seen"
  );
}

/**
 * @deprecated Prefer {@link optionalInviteeVotesPending}. Kept for call-site compatibility during PC-278.
 * Poll slot count is ignored — unfinished optional RSVP is tracked for all proposal types.
 */
export function optionalPollVotesPending(
  proposal: { state: ProposalState; isPoll: boolean },
  invitee: { role: InviteeRole; voteStatus: InviteeVoteStatus } | undefined,
  _pollSlotCount: number,
): boolean {
  return optionalInviteeVotesPending(proposal, invitee);
}
