import type { InviteeVoteStatus } from "@/lib/db/schema";

/** Human-readable labels for recorded vote outcomes (not view state). */
export const INVITEE_VOTE_LABELS: Record<InviteeVoteStatus, string> = {
  not_seen: "No vote",
  accept: "Accepted",
  abstain: "Abstained",
  decline: "Declined",
  accept_suboptimal: "Accepted sub-optimal",
};

/**
 * Label for a cast vote (poll slot cells, activity log vote lines).
 */
export function inviteeVoteLabel(status: InviteeVoteStatus | string): string {
  if (status in INVITEE_VOTE_LABELS) {
    return INVITEE_VOTE_LABELS[status as InviteeVoteStatus];
  }
  return status.replaceAll("_", " ");
}

/**
 * Invitee chip label combining vote outcome and first-view tracking (PC-76).
 */
export function inviteeDisplayLabel(
  voteStatus: InviteeVoteStatus,
  viewedAt: string | null | undefined,
): string {
  if (voteStatus !== "not_seen") {
    return inviteeVoteLabel(voteStatus);
  }
  if (!viewedAt) {
    return "Not yet viewed";
  }
  return "Pending response";
}
