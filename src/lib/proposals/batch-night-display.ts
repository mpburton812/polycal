import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";

/**
 * Formats one batch sleeping night for proposal detail and summary UI (PC-69).
 */
export function formatBatchNightLine(
  entry: BatchSleepingEntry,
  options: {
    inviteeNames: Map<string, string>;
    placeNames: Map<string, string>;
    nightIndex: number;
  },
): string {
  const date = entry.nightDate.slice(0, 10);
  const place =
    (entry.locationId ? options.placeNames.get(entry.locationId) : undefined) ??
    entry.locationText?.trim() ??
    "No location";

  const attendeeLabel = entry.intentionalSolo
    ? "Solo"
    : entry.invitees
        .map((invitee) => {
          const name = options.inviteeNames.get(invitee.userId) ?? "Invitee";
          return `${name} (${invitee.role})`;
        })
        .join(", ");

  const parts = [`Night ${options.nightIndex + 1}: ${date}`, place];
  if (attendeeLabel) parts.push(attendeeLabel);
  if (entry.comment?.trim()) parts.push(`"${entry.comment.trim()}"`);
  return parts.join(" · ");
}
