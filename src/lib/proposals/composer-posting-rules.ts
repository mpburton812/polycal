import type {
  PostingKind,
  ProxySchedulingScope,
  SchedulingPostingMode,
} from "@/types/network-settings";

/**
 * Validates Poll / posting-kind / Booking-for combinations against network settings (PC-427–PC-428).
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
  const dualPosting = input.schedulingPosting === "proposals_and_bookings";
  if (postingKind === "booking" && !dualPosting) {
    return { ok: false, error: "Direct booking is disabled for this network." };
  }
  if (postingKind === "booking" && input.isPoll) {
    return { ok: false, error: "Poll is not available for calendar bookings." };
  }
  if (input.isPoll && !input.pollEnabled && !input.isExistingPollDraft) {
    return { ok: false, error: "Poll is disabled for this network." };
  }

  const proxyId = input.onBehalfOfUserId?.trim() || null;
  if (proxyId && proxyId !== input.actorUserId) {
    if (postingKind !== "booking") {
      return { ok: false, error: "You can only book on behalf of someone in Booking mode." };
    }
    // Dual posting always enables Booking for; ignore a stale proxy_scheduling_enabled=0 row.
    if (!dualPosting) {
      return { ok: false, error: "Booking for is disabled for this network." };
    }
    if (!input.allowedProxyUserIds.has(proxyId)) {
      return { ok: false, error: "You cannot book on behalf of that person." };
    }
  }

  return { ok: true };
}
