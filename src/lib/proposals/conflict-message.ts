import type { ProposalConflictWarning } from "@/actions/proposals/types";

/**
 * Formats conflict warnings into a user-facing message that lists each conflict (PC-263).
 */
export function formatConflictMessage(warnings: ProposalConflictWarning[]): string {
  if (warnings.length === 0) {
    return "No conflicts.";
  }

  const lines = warnings.map((warning) => {
    const who = warning.conflictKind === "place_asset" ? "Place" : warning.displayName;
    return `${who} overlaps with "${warning.conflictingTitle}" (${warning.conflictingState})`;
  });

  return [`Schedule conflicts detected:`, ...lines].join("\n");
}
