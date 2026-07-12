/** Timing mode helpers for proposal drafts (PC-170). */

export type DraftTimingMode = "window" | "allDay" | "poll";

/** Derives exclusive timing mode from draft flags. */
export function timingModeFromFlags(input: {
  allDay: boolean;
  isPoll: boolean;
}): DraftTimingMode {
  if (input.isPoll) return "poll";
  if (input.allDay) return "allDay";
  return "window";
}

/** Applies a timing mode onto draft boolean flags without clearing Recurring. */
export function flagsFromTimingMode(mode: DraftTimingMode): {
  allDay: boolean;
  isPoll: boolean;
} {
  switch (mode) {
    case "allDay":
      return { allDay: true, isPoll: false };
    case "poll":
      return { allDay: false, isPoll: true };
    default:
      return { allDay: false, isPoll: false };
  }
}
