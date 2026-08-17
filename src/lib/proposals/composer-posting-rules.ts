import type {
  PostingKind,
  ProxySchedulingScope,
  SchedulingPostingMode,
} from "@/types/network-settings";

/**
 * Validates Poll / posting-kind / proxy combinations against network settings (PC-423–425).
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
  if (postingKind === "schedule" && input.schedulingPosting !== "proposals_and_schedule") {
    return { ok: false, error: "Direct scheduling is disabled for this network." };
  }
  if (postingKind === "schedule" && input.isPoll) {
    return { ok: false, error: "Poll is not available for calendar schedules." };
  }
  if (input.isPoll && !input.pollEnabled && !input.isExistingPollDraft) {
    return { ok: false, error: "Poll is disabled for this network." };
  }

  const proxyId = input.onBehalfOfUserId?.trim() || null;
  if (proxyId && proxyId !== input.actorUserId) {
    if (postingKind !== "schedule") {
      return { ok: false, error: "You can only schedule on behalf of someone in Schedule mode." };
    }
    if (!input.proxySchedulingEnabled || input.schedulingPosting !== "proposals_and_schedule") {
      return { ok: false, error: "Proxy scheduling is disabled for this network." };
    }
    if (!input.allowedProxyUserIds.has(proxyId)) {
      return { ok: false, error: "You cannot schedule on behalf of that person." };
    }
  }

  return { ok: true };
}
