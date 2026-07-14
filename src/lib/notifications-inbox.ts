/**
 * Pure helpers for which in-app notification rows are cleared when a user
 * responds to a proposal (PC-217).
 */

/** Telemetry types excluded from the user-facing inbox. */
export const INBOX_EXCLUDED_NOTIFICATION_TYPES = new Set([
  "push_sent",
  "push_failed",
  "push_skipped",
  "email_queued",
  "email_sent",
  "email_failed",
]);

/**
 * True when this undismissed notification should be cleared after the recipient
 * votes / responds on the matching proposal (PC-217).
 */
export function isActionableProposalNotification(
  type: string,
  metadata: Record<string, unknown>,
): boolean {
  if (INBOX_EXCLUDED_NOTIFICATION_TYPES.has(type)) return false;
  if (type === "proposal_submitted") return true;
  if (type === "proposal_attendee_update") return true;
  if (metadata.action === "vote") return true;
  return false;
}

/**
 * Extracts proposalId from notification metadata/details when present.
 */
export function proposalIdFromNotificationMetadata(
  metadata: Record<string, unknown>,
): string | null {
  return typeof metadata.proposalId === "string" ? metadata.proposalId : null;
}
