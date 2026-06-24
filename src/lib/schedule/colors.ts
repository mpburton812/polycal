/** Schedule color coding per spec §10 (PC-42). */
export const SCHEDULE_COLORS = {
  proposed: "#f9a825",
  resolvedEvent: "#2e7d32",
  resolvedSleeping: "#1565c0",
  conflict: "#c62828",
  masked: "#9e9e9e",
} as const;

export type ScheduleBlockVariant =
  | "proposed"
  | "resolved_event"
  | "resolved_sleeping"
  | "conflict"
  | "masked";

/**
 * Picks block colors from proposal state, type, and conflict flags.
 */
export function scheduleBlockVariant(event: {
  state: "proposed" | "resolved";
  proposalType: "event" | "sleeping";
  isContentMasked: boolean;
  hasOverlap: boolean;
  atRisk: boolean;
}): ScheduleBlockVariant {
  if (event.isContentMasked) return "masked";
  if (event.hasOverlap || event.atRisk) return "conflict";
  if (event.state === "proposed") return "proposed";
  if (event.proposalType === "sleeping") return "resolved_sleeping";
  return "resolved_event";
}

export function scheduleBlockSx(variant: ScheduleBlockVariant): {
  bgcolor: string;
  color: string;
  border: string;
  backgroundImage?: string;
} {
  switch (variant) {
    case "proposed":
      return {
        bgcolor: "rgba(249, 168, 37, 0.35)",
        color: "#5d4037",
        border: "2px dashed #f9a825",
        backgroundImage:
          "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(249,168,37,0.12) 4px, rgba(249,168,37,0.12) 8px)",
      };
    case "resolved_event":
      return {
        bgcolor: "rgba(46, 125, 50, 0.2)",
        color: "#1b5e20",
        border: "2px solid #2e7d32",
      };
    case "resolved_sleeping":
      return {
        bgcolor: "rgba(21, 101, 192, 0.2)",
        color: "#0d47a1",
        border: "2px solid #1565c0",
      };
    case "conflict":
      return {
        bgcolor: "rgba(198, 40, 40, 0.15)",
        color: "#b71c1c",
        border: "2px solid #c62828",
      };
    case "masked":
      return {
        bgcolor: "rgba(158, 158, 158, 0.2)",
        color: "#616161",
        border: "2px dashed #9e9e9e",
      };
    default:
      return {
        bgcolor: "rgba(158, 158, 158, 0.2)",
        color: "#616161",
        border: "1px solid #bdbdbd",
      };
  }
}
