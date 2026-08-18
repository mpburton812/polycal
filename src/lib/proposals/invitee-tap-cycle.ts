import type { InviteeSelection } from "@/components/proposals/proposalDraftDateUtils";

/**
 * Cycles a Who-chip role. Booking first-tap is booked; Proposal first-tap is required.
 */
export function nextInviteeSelection(
  current: InviteeSelection,
  postingKind: "proposal" | "booking",
): InviteeSelection {
  if (postingKind === "booking") {
    if (current === "none") return "booked";
    if (current === "booked") return "optional";
    return "none";
  }
  if (current === "none") return "required";
  if (current === "required") return "optional";
  return "none";
}

/** True when the person is on the event (any non-none role). */
export function inviteeIsSelected(role: InviteeSelection | undefined): boolean {
  return role === "required" || role === "optional" || role === "booked";
}
