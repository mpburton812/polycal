import {
  EVENT_BLOCK_ROTATIONS,
  GARDEN_TOKENS,
  ORGANIC_RADIUS,
  SCHEDULE_SEMANTIC_COLORS,
  type ScheduleSemanticVariant,
} from "@/theme/tokens";

/** @deprecated Use GARDEN_TOKENS / SCHEDULE_SEMANTIC_COLORS — kept for imports during migration. */
export const SCHEDULE_COLORS = {
  proposed: SCHEDULE_SEMANTIC_COLORS.proposed.fill,
  resolvedEvent: SCHEDULE_SEMANTIC_COLORS.resolved_event.fill,
  resolvedSleeping: SCHEDULE_SEMANTIC_COLORS.resolved_sleeping.fill,
  conflict: SCHEDULE_SEMANTIC_COLORS.conflict.fill,
  masked: SCHEDULE_SEMANTIC_COLORS.masked.fill,
} as const;

export type ScheduleBlockVariant = ScheduleSemanticVariant;

/**
 * Picks block colors from proposal state, type, and conflict flags.
 */
export function scheduleBlockVariant(event: {
  state: "proposed" | "resolved" | "archived";
  proposalType: "event" | "sleeping";
  isContentMasked: boolean;
  hasOverlap: boolean;
  atRisk: boolean;
  /** Partner-only sleeping (viewer not involved) — lighter purple (PC-366). */
  isPartnerOnlySleeping?: boolean;
}): ScheduleBlockVariant {
  if (event.isContentMasked) return "masked";
  if (event.state === "archived") return "archived";
  if (event.hasOverlap) return "conflict";
  if (event.atRisk) return "at_risk";
  if (event.state === "proposed") return "proposed";
  if (event.proposalType === "sleeping") {
    return event.isPartnerOnlySleeping ? "resolved_sleeping_partner" : "resolved_sleeping";
  }
  return "resolved_event";
}

/**
 * Garden Brutalism event block styles — flat pastel fills and ink strokes (no shadows).
 */
export function scheduleBlockSx(
  variant: ScheduleBlockVariant,
  rotationIndex = 0,
): {
  bgcolor: string;
  color: string;
  border: string;
  borderRadius: string;
  transform: string;
  backgroundImage?: string;
} {
  const semantic = SCHEDULE_SEMANTIC_COLORS[variant];
  const rotation =
    EVENT_BLOCK_ROTATIONS[rotationIndex % EVENT_BLOCK_ROTATIONS.length] ?? "0deg";

  const base = {
    bgcolor: semantic.fill,
    color: semantic.text,
    border: `2px ${semantic.borderStyle} ${GARDEN_TOKENS.ink}`,
    borderRadius: ORGANIC_RADIUS,
    transform: `rotate(${rotation})`,
  };

  if (variant === "proposed" || variant === "at_risk") {
    return {
      ...base,
      backgroundImage:
        variant === "proposed"
          ? "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(26,26,26,0.04) 5px, rgba(26,26,26,0.04) 10px)"
          : "repeating-linear-gradient(-45deg, transparent, transparent 5px, rgba(26,26,26,0.05) 5px, rgba(26,26,26,0.05) 10px)",
    };
  }

  return base;
}
