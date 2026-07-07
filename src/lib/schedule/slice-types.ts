/** Calendar interaction layer — tap target identity separate from vote ownership (Schedule Slices). */

export type ScheduleSliceKind =
  | "standalone"
  | "virtual_span_day"
  | "batch_night"
  | "recurrence_occurrence";

export interface ScheduleSlice {
  /** Proposal that owns votes and the comment thread. */
  rootProposalId: string;
  sliceKind: ScheduleSliceKind;
  /** slot id, yyyy-MM-dd date key, or proposal id depending on kind. */
  sliceKey: string;
  /** Set only for recurrence_occurrence — materialized child row. */
  occurrenceProposalId: string | null;
  /** Source time slot when the slice maps to a slot row. */
  slotId: string | null;
}

export function formatSliceTag(sliceKind: ScheduleSliceKind, sliceKey: string): string | null {
  if (sliceKind === "batch_night") return `slot:${sliceKey}`;
  if (sliceKind === "virtual_span_day") return `day:${sliceKey}`;
  return null;
}

export function standaloneSlice(proposalId: string): ScheduleSlice {
  return {
    rootProposalId: proposalId,
    sliceKind: "standalone",
    sliceKey: proposalId,
    occurrenceProposalId: null,
    slotId: null,
  };
}
