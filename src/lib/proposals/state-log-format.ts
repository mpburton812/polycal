import { formatActivityLogDetails } from "@/lib/audit/activity-log-display";
import { inviteeVoteLabel } from "@/lib/proposals/invitee-display-status";

export interface ProposalLogEntry {
  action: string;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}

/**
 * Human-readable activity log line for proposal detail (PC-53, PC-59, PC-245).
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
    "proposal.admin_fast_add": "Admin fast sleeping add",
    "proposal.admin_rescheduled": "Rescheduled by admin",
    "proposal.attendees_updated": "Attendees updated",
    "proposal.comment_added": "Comment added",
    "proposal.child_detached": "Child detached",
    "proposal.detached_from_parent": "Detached from parent",
    "proposal.recurrence_child_created": "Series occurrence created",
    "proposal.passive_auto_accept": "Proxy auto-accept",
    "proposal.passive_proxy_vote": "Proxy vote",
    "draft.created": "Draft created",
  };
  return labels[action] ?? action.replaceAll(".", " · ").replaceAll("_", " ");
}

function formatVoteLabel(vote: string): string {
  return inviteeVoteLabel(vote);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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
      (entry.action === "proposal.vote_cast" ||
        entry.action === "proposal.slot_vote_cast" ||
        entry.action === "proposal.passive_proxy_vote") &&
      typeof parsed.vote === "string"
    ) {
      const voteText = formatVoteLabel(parsed.vote);
      const forName = asString(parsed.displayName) ?? asString(parsed.passiveDisplayName);
      const forSuffix = forName ? ` for ${forName}` : "";
      if (entry.action === "proposal.slot_vote_cast") {
        const slotLabel = asString(parsed.slotLabel) ?? asString(parsed.label);
        if (slotLabel) return ` · ${voteText} (${slotLabel})`;
        return ` · ${voteText}`;
      }
      return ` · ${voteText}${forSuffix}`;
    }

    if (entry.action === "proposal.submitted" && typeof parsed.nextState === "string") {
      return ` · moved to ${parsed.nextState}`;
    }

    if (entry.action === "proposal.comment_added" && typeof parsed.sliceTag === "string") {
      return ` · tagged ${parsed.sliceTag}`;
    }

    if (
      (entry.action === "proposal.child_detached" ||
        entry.action === "proposal.detached_from_parent") &&
      typeof parsed.sliceKey === "string"
    ) {
      return ` · ${parsed.sliceKey}`;
    }

    if (entry.action === "proposal.admin_rescheduled") {
      const start = asString(parsed.scheduledStartAt);
      const end = asString(parsed.scheduledEndAt);
      if (start && end) {
        return ` · ${formatDateTime(start)} – ${formatDateTime(end)}`;
      }
      if (start) return ` · ${formatDateTime(start)}`;
    }

    if (entry.action === "proposal.admin_fast_add") {
      const target = asString(parsed.targetDisplayName) ?? asString(parsed.targetUserId);
      const nights = asNumber(parsed.nightCount);
      const parts = [
        target ? `for ${target}` : null,
        nights !== null ? `${nights} night${nights === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      if (parts.length) return ` · ${parts.join(", ")}`;
    }

    if (entry.action === "proposal.recurrence_child_created") {
      const index = asNumber(parsed.occurrenceIndex);
      if (index !== null) return ` · occurrence #${index + 1}`;
    }

    if (entry.action === "proposal.passive_auto_accept") {
      const name = asString(parsed.displayName);
      if (name) return ` · ${name}`;
    }

    if (entry.action === "draft.created") {
      const kind = asString(parsed.kind);
      if (kind === "residency") return " · residency request";
      if (kind) return ` · ${kind}`;
    }

    const message = asString(parsed.message);
    if (message) return ` · ${message}`;
  } catch {
    const fallback = formatActivityLogDetails(entry.action, entry.details);
    return fallback ? ` · ${fallback}` : "";
  }

  const fallback = formatActivityLogDetails(entry.action, entry.details);
  return fallback ? ` · ${fallback}` : "";
}

export { formatVoteLabel };
