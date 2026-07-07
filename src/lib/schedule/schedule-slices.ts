import { localDateKey } from "@/lib/schedule/dates";
import type { ScheduleSlice, ScheduleSliceKind } from "@/lib/schedule/slice-types";

export interface RawScheduleWindow {
  startAt: string;
  endAt: string | null;
  slotLabel: string | null;
  key: string;
  slotId: string | null;
  slice: ScheduleSlice;
}

export interface ScheduleRowSliceContext {
  id: string;
  isAllDay: boolean;
  isBatchSleeping: boolean;
  parentProposalId: string | null;
  isRecurrenceParent: boolean;
}

export interface ScheduleSlotRow {
  id: string;
  startAt: string;
  endAt: string | null;
  label: string | null;
  isDetached?: boolean;
}

/**
 * True when an all-day interval spans more than one calendar day (UTC keys).
 */
export function isMultiDayAllDaySpan(
  startAt: string,
  endAt: string | null,
  isAllDay: boolean,
): boolean {
  if (!isAllDay || !endAt) return false;
  return localDateKey(startAt) !== localDateKey(endAt);
}

/**
 * Inclusive UTC date keys from start through end for multi-day all-day spans.
 */
export function expandAllDayDateKeys(startAt: string, endAt: string | null): string[] {
  const endKey = localDateKey(endAt ?? startAt);
  const keys: string[] = [];
  const cursor = new Date(startAt);
  cursor.setUTCHours(0, 0, 0, 0);

  for (let guard = 0; guard < 366; guard += 1) {
    const key = localDateKey(cursor.toISOString());
    keys.push(key);
    if (key >= endKey) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

/** Midnight-to-end-of-day ISO bounds for one all-day calendar key. */
export function allDayBoundsForDateKey(dateKey: string): { startAt: string; endAt: string } {
  return {
    startAt: `${dateKey}T00:00:00.000Z`,
    endAt: `${dateKey}T23:59:59.999Z`,
  };
}

function sliceForWindow(
  row: ScheduleRowSliceContext,
  slotId: string | null,
  dateKey?: string,
): ScheduleSlice {
  if (row.parentProposalId) {
    return {
      rootProposalId: row.parentProposalId,
      sliceKind: "recurrence_occurrence",
      sliceKey: row.id,
      occurrenceProposalId: row.id,
      slotId,
    };
  }

  if (row.isBatchSleeping && slotId) {
    return {
      rootProposalId: row.id,
      sliceKind: "batch_night",
      sliceKey: slotId,
      occurrenceProposalId: null,
      slotId,
    };
  }

  if (dateKey) {
    return {
      rootProposalId: row.id,
      sliceKind: "virtual_span_day",
      sliceKey: dateKey,
      occurrenceProposalId: null,
      slotId,
    };
  }

  return {
    rootProposalId: row.id,
    sliceKind: "standalone",
    sliceKey: slotId ?? row.id,
    occurrenceProposalId: null,
    slotId,
  };
}

function pushWindow(
  target: RawScheduleWindow[],
  row: ScheduleRowSliceContext,
  input: {
    startAt: string;
    endAt: string | null;
    slotLabel: string | null;
    key: string;
    slotId: string | null;
    dateKey?: string;
  },
): void {
  target.push({
    startAt: input.startAt,
    endAt: input.endAt,
    slotLabel: input.slotLabel,
    key: input.key,
    slotId: input.slotId,
    slice: sliceForWindow(row, input.slotId, input.dateKey),
  });
}

/**
 * Builds calendar windows with slice metadata from proposal rows and slots.
 * Recurrence parents emit no calendar windows — children are the tap targets.
 */
function pushRecurrenceParentOccurrence(
  target: RawScheduleWindow[],
  row: ScheduleRowSliceContext,
  input: {
    startAt: string;
    endAt: string | null;
    slotLabel: string | null;
    key: string;
    slotId: string | null;
  },
): void {
  target.push({
    startAt: input.startAt,
    endAt: input.endAt,
    slotLabel: input.slotLabel,
    key: input.key,
    slotId: input.slotId,
    slice: {
      rootProposalId: row.id,
      sliceKind: "recurrence_occurrence",
      sliceKey: row.id,
      occurrenceProposalId: row.id,
      slotId: input.slotId,
    },
  });
}

export function buildScheduleWindows(
  row: ScheduleRowSliceContext,
  slots: ScheduleSlotRow[],
  scheduled: { startAt: string; endAt: string | null } | null,
): RawScheduleWindow[] {
  const activeSlots = slots.filter((slot) => !slot.isDetached);
  const windows: RawScheduleWindow[] = [];

  const emitInterval = (
    startAt: string,
    endAt: string | null,
    slotLabel: string | null,
    slotId: string | null,
    keyPrefix: string,
  ) => {
    if (row.isRecurrenceParent) {
      pushRecurrenceParentOccurrence(windows, row, {
        startAt,
        endAt,
        slotLabel,
        key: slotId ? `${keyPrefix}:${slotId}` : `${keyPrefix}:occurrence-0`,
        slotId,
      });
      return;
    }

    if (
      row.isBatchSleeping ||
      row.parentProposalId ||
      !isMultiDayAllDaySpan(startAt, endAt, row.isAllDay)
    ) {
      pushWindow(windows, row, {
        startAt,
        endAt,
        slotLabel,
        key: slotId ? `${keyPrefix}:${slotId}` : keyPrefix,
        slotId,
      });
      return;
    }

    for (const dateKey of expandAllDayDateKeys(startAt, endAt)) {
      const bounds = allDayBoundsForDateKey(dateKey);
      pushWindow(windows, row, {
        startAt: bounds.startAt,
        endAt: bounds.endAt,
        slotLabel,
        key: `${keyPrefix}:${dateKey}`,
        slotId,
        dateKey,
      });
    }
  };

  if (activeSlots.length > 0) {
    for (const slot of activeSlots) {
      emitInterval(slot.startAt, slot.endAt, slot.label, slot.id, row.id);
    }
  } else if (scheduled) {
    emitInterval(scheduled.startAt, scheduled.endAt, null, null, row.id);
  }

  return windows;
}

export function isSliceGroupKind(kind: ScheduleSliceKind): boolean {
  return kind === "batch_night" || kind === "virtual_span_day";
}

/**
 * True when a proposal row can emit at least one calendar window.
 */
export function proposalHasSchedulableWindows(
  row: ScheduleRowSliceContext & {
    state: string;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
  },
  slots: ScheduleSlotRow[],
): boolean {
  let scheduled: { startAt: string; endAt: string | null } | null = null;
  let slotsForWindows = slots;

  if (row.state === "resolved" || row.state === "archived") {
    if (!(row.isBatchSleeping && slots.length > 0) && row.scheduledStartAt) {
      scheduled = { startAt: row.scheduledStartAt, endAt: row.scheduledEndAt ?? null };
    }
    if (!row.isBatchSleeping) {
      slotsForWindows = [];
    }
  } else if (row.state === "proposed") {
    if (slots.length === 0 && row.scheduledStartAt) {
      scheduled = { startAt: row.scheduledStartAt, endAt: row.scheduledEndAt ?? null };
    }
  }

  return buildScheduleWindows(row, slotsForWindows, scheduled).length > 0;
}
