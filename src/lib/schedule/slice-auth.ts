import type { ProposalState } from "@/lib/db/schema";
import {
  allDayBoundsForDateKey,
  expandAllDayDateKeys,
  isMultiDayAllDaySpan,
} from "@/lib/schedule/schedule-slices";
import { formatSliceTag, type ScheduleSliceKind } from "@/lib/schedule/slice-types";

export interface SliceMembershipParent {
  id: string;
  isBatchSleeping: boolean;
  isAllDay: boolean;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
}

export interface SliceMembershipSlot {
  id: string;
  startAt: string;
  endAt: string | null;
  isDetached?: boolean;
}

export interface ScheduleMaskingInput {
  viewerId: string;
  proposerId: string;
  inviteeUserIds: string[];
  proposalType: "event" | "sleeping";
  privacyFlags: { hideSleeping: boolean };
  acceptedPartnerIds: Set<string>;
}

/**
 * Sleeping-arrangement masking for schedule and slice surfaces (event/super-private
 * masking was removed with PC-280 — proposals are always "open").
 */
export function applyScheduleMasking(input: ScheduleMaskingInput): {
  sleepingMasked: boolean;
  isContentMasked: boolean;
} {
  const sleepingMasked =
    input.proposalType === "sleeping" &&
    shouldMaskSleepingForViewer(
      input.viewerId,
      input.proposerId,
      input.inviteeUserIds,
      input.privacyFlags.hideSleeping,
      input.acceptedPartnerIds,
    );

  return {
    sleepingMasked,
    isContentMasked: sleepingMasked,
  };
}

/**
 * Mirrors schedule list masking — hides sleeping details from non-participants when configured.
 */
export function shouldMaskSleepingForViewer(
  viewerId: string,
  proposerId: string,
  inviteeUserIds: string[],
  hideSleeping: boolean,
  acceptedPartnerIds: Set<string>,
): boolean {
  if (!hideSleeping) return false;
  if (proposerId === viewerId || inviteeUserIds.includes(viewerId)) return false;
  const participants = new Set([proposerId, ...inviteeUserIds]);
  for (const participantId of participants) {
    if (participantId !== viewerId && acceptedPartnerIds.has(participantId)) {
      return false;
    }
  }
  return true;
}

/**
 * Validates that a slice key belongs to the parent proposal (read + write paths).
 */
export function validateSliceMembership(
  parent: SliceMembershipParent,
  slots: SliceMembershipSlot[],
  sliceKind: "batch_night" | "virtual_span_day",
  sliceKey: string,
): { ok: true } | { ok: false; message: string } {
  if (sliceKind === "batch_night") {
    if (!parent.isBatchSleeping) {
      return { ok: false, message: "Not a batch sleeping proposal." };
    }
    const slot = slots.find((row) => row.id === sliceKey);
    if (!slot || slot.isDetached) {
      return { ok: false, message: "Night not found." };
    }
    return { ok: true };
  }

  if (parent.isBatchSleeping) {
    return { ok: false, message: "Use batch night detach for sleeping batches." };
  }

  const activeSlots = slots.filter((slot) => !slot.isDetached);
  let sourceStart = parent.scheduledStartAt;
  let sourceEnd = parent.scheduledEndAt;

  if (activeSlots.length > 0) {
    const spanSlot =
      activeSlots.find((slot) =>
        expandAllDayDateKeys(slot.startAt, slot.endAt).includes(sliceKey),
      ) ?? activeSlots[0]!;
    sourceStart = spanSlot.startAt;
    sourceEnd = spanSlot.endAt;
  }

  if (
    !sourceStart ||
    !isMultiDayAllDaySpan(sourceStart, sourceEnd ?? sourceStart, parent.isAllDay)
  ) {
    return { ok: false, message: "Day not part of a multi-day span." };
  }

  const allKeys = expandAllDayDateKeys(sourceStart, sourceEnd);
  if (!allKeys.includes(sliceKey)) {
    return { ok: false, message: "Day not found in span." };
  }

  return { ok: true };
}

/**
 * Single source for comment permission on proposals and slice detail UI.
 * All proposals are "open" (privacy levels removed PC-280), so any viewer who can
 * see a non-masked, non-draft/archived proposal may comment on it.
 */
export function canCommentOnProposal(input: {
  state: ProposalState;
  isContentMasked: boolean;
}): boolean {
  if (input.isContentMasked) return false;
  if (input.state === "draft" || input.state === "archived") return false;
  return true;
}

const SLICE_TAG_PATTERN = /^(slot:[\w-]+|day:\d{4}-\d{2}-\d{2})$/;

/**
 * Validates client-supplied slice tags against known slice identity formats.
 */
export function validateSliceTagValue(tag: string | null | undefined): boolean {
  if (!tag) return true;
  return SLICE_TAG_PATTERN.test(tag);
}

/**
 * Ensures a comment slice tag matches the parent proposal structure.
 */
export function validateSliceTagForProposal(
  parent: SliceMembershipParent,
  slots: SliceMembershipSlot[],
  sliceKind: ScheduleSliceKind | null,
  sliceKey: string | null,
  tag: string | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!tag) return { ok: true };
  if (!validateSliceTagValue(tag)) {
    return { ok: false, message: "Invalid slice tag." };
  }

  if (sliceKind === "batch_night" || sliceKind === "virtual_span_day") {
    const expected = formatSliceTag(sliceKind, sliceKey ?? "");
    if (expected && tag !== expected) {
      return { ok: false, message: "Slice tag does not match this slice." };
    }
    const membership = validateSliceMembership(parent, slots, sliceKind, sliceKey ?? "");
    if (!membership.ok) return membership;
    return { ok: true };
  }

  if (tag.startsWith("slot:")) {
    const slotId = tag.slice("slot:".length);
    const membership = validateSliceMembership(parent, slots, "batch_night", slotId);
    if (!membership.ok) return membership;
    return { ok: true };
  }

  if (tag.startsWith("day:")) {
    const dayKey = tag.slice("day:".length);
    allDayBoundsForDateKey(dayKey);
    const membership = validateSliceMembership(parent, slots, "virtual_span_day", dayKey);
    if (!membership.ok) return membership;
    return { ok: true };
  }

  return { ok: false, message: "Invalid slice tag." };
}
