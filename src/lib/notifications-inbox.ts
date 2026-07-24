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

/**
 * Extracts partnershipId from notification metadata when present.
 */
export function partnershipIdFromNotificationMetadata(
  metadata: Record<string, unknown>,
): string | null {
  return typeof metadata.partnershipId === "string" ? metadata.partnershipId : null;
}

/**
 * Extracts residencyId from notification metadata when present.
 */
export function residencyIdFromNotificationMetadata(
  metadata: Record<string, unknown>,
): string | null {
  return typeof metadata.residencyId === "string" ? metadata.residencyId : null;
}

/**
 * True when a partnership_proposed row should still appear as actionable (PC-349).
 */
export function isPartnershipStillActionable(status: string | null | undefined): boolean {
  return status === "proposed";
}

/**
 * True when a residency_proposed row should still appear as actionable (PC-349).
 */
export function isResidencyStillActionable(status: string | null | undefined): boolean {
  return status === "proposed";
}

/**
 * True when a vote-style proposal inbox row is still actionable for this invitee (PC-349).
 */
export function isProposalVoteStillActionable(options: {
  proposalState: string | null | undefined;
  voteStatus: string | null | undefined;
  atRisk?: boolean | null;
  role?: string | null;
}): boolean {
  if (!options.proposalState || !options.voteStatus) return false;
  if (options.voteStatus !== "not_seen") return false;
  if (options.proposalState === "proposed") return true;
  if (options.proposalState === "resolved") {
    // Optional RSVP / at-risk required vote still needs a response.
    if (options.role === "optional") return true;
    if (options.atRisk && options.role === "required") return true;
  }
  return false;
}

/**
 * True when a proposal_attendee_update row is still actionable (PC-349).
 */
export function isAttendeeUpdateStillActionable(options: {
  proposalState: string | null | undefined;
  voteStatus: string | null | undefined;
  maintainedAfterNotification: boolean;
}): boolean {
  if (options.maintainedAfterNotification) return false;
  if (options.proposalState !== "resolved") return false;
  if (options.voteStatus === "decline") return false;
  return true;
}
