import type { InviteeRole, InviteeVoteStatus, ProposalState } from "@/lib/db/schema";

/**
 * True when an optional invitee still owes poll matrix votes on a resolved poll (PC-49).
 */
export function optionalPollVotesPending(
  proposal: { state: ProposalState; isPoll: boolean },
  invitee: { role: InviteeRole; voteStatus: InviteeVoteStatus } | undefined,
  pollSlotCount: number,
): boolean {
  return (
    proposal.state === "resolved" &&
    proposal.isPoll &&
    pollSlotCount > 1 &&
    invitee?.role === "optional" &&
    invitee.voteStatus === "not_seen"
  );
}
