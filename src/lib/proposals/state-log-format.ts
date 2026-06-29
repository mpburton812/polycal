import { formatActivityLogDetails } from "@/lib/audit/activity-log-display";

export interface ProposalLogEntry {
  action: string;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}

const VOTE_LABELS: Record<string, string> = {
  accept: "Accepted",
  accept_suboptimal: "Accepted sub-optimal",
  abstain: "Abstained",
  decline: "Declined",
  not_seen: "Not seen",
};

/**
 * Human-readable activity log line for proposal detail (PC-53, PC-59).
 */
export function formatProposalLogLine(entry: ProposalLogEntry): string {
  const action = formatActionLabel(entry.action);
  const actor = entry.actorName ? ` · ${entry.actorName}` : "";
  const detailSuffix = formatProposalLogDetails(entry);
  return `${new Date(entry.createdAt).toLocaleString()} · ${action}${actor}${detailSuffix}`;
}

/** Maps machine action keys to readable phrases. */
function formatActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "proposal.slot_vote_cast": "Poll slot vote",
    "proposal.vote_cast": "Vote cast",
    "proposal.submitted": "Submitted to network",
    "proposal.resolved": "Resolved",
    "proposal.redrafted": "Returned to draft",
    "proposal.attendees_updated": "Attendees updated",
    "proposal.comment_added": "Comment added",
  };
  return labels[action] ?? action.replaceAll(".", " · ").replaceAll("_", " ");
}

function formatVoteLabel(vote: string): string {
  return VOTE_LABELS[vote] ?? vote.replaceAll("_", " ");
}

function formatProposalLogDetails(entry: ProposalLogEntry): string {
  if (!entry.details?.trim()) return "";

  try {
    const parsed = JSON.parse(entry.details) as Record<string, unknown>;

    if (entry.action === "proposal.attendees_updated") {
      const parts: string[] = [];
      const addedRequired = parsed.addedRequired as string[] | undefined;
      const addedOptional = parsed.addedOptional as string[] | undefined;
      const removed = parsed.removedUserIds as string[] | undefined;
      if (addedRequired?.length) parts.push(`added required: ${addedRequired.join(", ")}`);
      if (addedOptional?.length) parts.push(`added optional: ${addedOptional.join(", ")}`);
      if (removed?.length) parts.push(`removed: ${removed.join(", ")}`);
      return parts.length ? ` · ${parts.join("; ")}` : "";
    }

    if (
      (entry.action === "proposal.vote_cast" || entry.action === "proposal.slot_vote_cast") &&
      typeof parsed.vote === "string"
    ) {
      const voteText = formatVoteLabel(parsed.vote);
      if (entry.action === "proposal.slot_vote_cast" && typeof parsed.timeSlotId === "string") {
        return ` · ${voteText} (slot ${parsed.timeSlotId.slice(0, 8)}…)`;
      }
      return ` · ${voteText}`;
    }

    if (entry.action === "proposal.submitted" && typeof parsed.nextState === "string") {
      return ` · moved to ${parsed.nextState}`;
    }
  } catch {
    return ` · ${formatActivityLogDetails(entry.action, entry.details)}`;
  }

  return ` · ${formatActivityLogDetails(entry.action, entry.details)}`;
}

export { formatVoteLabel };
