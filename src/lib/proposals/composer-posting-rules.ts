import {
  bookingsEnabled,
  schedulingProposalsEnabled,
  type PostingKind,
  type ProxySchedulingScope,
  type SchedulingPostingMode,
} from "@/types/network-settings";

/**
 * Validates Poll / posting-kind / Booking-for combinations against network settings (PC-427–PC-447).
 */
export function assertComposerPostingRules(input: {
  pollEnabled: boolean;
  schedulingPosting: SchedulingPostingMode;
  proxySchedulingEnabled: boolean;
  proxySchedulingScope: ProxySchedulingScope;
  isPoll: boolean;
  isExistingPollDraft: boolean;
  postingKind: PostingKind;
  onBehalfOfUserId: string | null | undefined;
  actorUserId: string;
  allowedProxyUserIds: ReadonlySet<string>;
}): { ok: true } | { ok: false; error: string } {
  const { postingKind } = input;
  const canBook = bookingsEnabled(input.schedulingPosting);
  if (postingKind === "booking" && !canBook) {
    return { ok: false, error: "Direct booking is disabled for this network." };
  }
  if (postingKind === "proposal" && !schedulingProposalsEnabled(input.schedulingPosting)) {
    return { ok: false, error: "Scheduling proposals are disabled for this network." };
  }
  if (postingKind === "booking" && input.isPoll) {
    return { ok: false, error: "Poll is not available for calendar bookings." };
  }
  if (input.schedulingPosting === "bookings_only" && input.isPoll && !input.isExistingPollDraft) {
    return { ok: false, error: "Poll is disabled when Event Types is Just Bookings." };
  }
  if (input.isPoll && !input.pollEnabled && !input.isExistingPollDraft) {
    return { ok: false, error: "Poll is disabled for this network." };
  }

  const proxyId = input.onBehalfOfUserId?.trim() || null;
  if (proxyId && proxyId !== input.actorUserId) {
    if (postingKind !== "booking") {
      return { ok: false, error: "You can only book on behalf of someone in Booking mode." };
    }
    // Bookings-enabled modes always allow Booking for; ignore a stale proxy_scheduling_enabled=0 row.
    if (!canBook) {
      return { ok: false, error: "Booking for is disabled for this network." };
    }
    if (!input.allowedProxyUserIds.has(proxyId)) {
      return { ok: false, error: "You cannot book on behalf of that person." };
    }
  }

  return { ok: true };
}
