import { schedulingProposalsEnabled, type SchedulingPostingMode } from "@/types/network-settings";

/**
 * Submit toasts and notifications (PC-533).
 * Just Bookings is a booking, not an auto-approved proposal.
 */
export function submitResultMessage(input: {
  autoResolve: boolean;
  schedulingPosting: SchedulingPostingMode;
}): string {
  if (!input.autoResolve) return "Proposal submitted to your network.";
  if (!schedulingProposalsEnabled(input.schedulingPosting)) return "Booked.";
  return "Proposal auto-approved and resolved.";
}

export function submitNotificationMessage(input: {
  autoResolve: boolean;
  schedulingPosting: SchedulingPostingMode;
  actorDisplayName: string;
  title: string;
}): string {
  const actor = input.actorDisplayName.trim() || "Someone";
  if (input.autoResolve && !schedulingProposalsEnabled(input.schedulingPosting)) {
    return `${actor} booked "${input.title}".`;
  }
  if (input.autoResolve) {
    return `${actor}'s proposal "${input.title}" was auto-approved.`;
  }
  return `Proposal "${input.title}" needs your review.`;
}
