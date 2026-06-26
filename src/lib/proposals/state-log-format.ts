export interface ProposalLogEntry {
  action: string;
  actorName: string | null;
  details: string | null;
  createdAt: string;
}

/**
 * Human-readable activity log line for proposal detail (PC-53).
 */
export function formatProposalLogLine(entry: ProposalLogEntry): string {
  const action = entry.action.replaceAll(".", " · ").replaceAll("_", " ");
  const actor = entry.actorName ? ` · ${entry.actorName}` : "";
  const detailSuffix = formatProposalLogDetails(entry);
  return `${new Date(entry.createdAt).toLocaleString()} · ${action}${actor}${detailSuffix}`;
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

    if (entry.action === "proposal.vote_cast" && typeof parsed.vote === "string") {
      return ` · ${parsed.vote.replaceAll("_", " ")}`;
    }
  } catch {
    return ` · ${entry.details}`;
  }

  return ` · ${entry.details}`;
}
