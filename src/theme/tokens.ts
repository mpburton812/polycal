/**
 * Garden Brutalism design tokens — shared by MUI theme and schedule/event UI.
 * Stitch source: PolyCal — Garden Brutalism design system.
 */

export const GARDEN_TOKENS = {
  background: "#F7F2EA",
  surface: "#FFFDF8",
  ink: "#1A1A1A",
  inkMuted: "#5C534A",
  outlineSoft: "#D4C4B0",
  terracotta: "#C96E5A",
  sage: "#6B8F71",
  mustard: "#D4A017",
  lavender: "#8B7AB8",
} as const;

/** Organic default radius — uneven corners for cards and day cells. */
export const ORGANIC_RADIUS = "20px 8px 18px 10px";

/** Slight rotation variants for staggered event blocks (deterministic by index). */
export const EVENT_BLOCK_ROTATIONS = ["-0.4deg", "0.35deg", "-0.25deg", "0.5deg"] as const;

export const STROKE_DEFAULT = `2px solid ${GARDEN_TOKENS.ink}`;
export const STROKE_HEAVY = `3px solid ${GARDEN_TOKENS.ink}`;

export type ScheduleSemanticVariant =
  | "proposed"
  | "resolved_event"
  | "resolved_sleeping"
  | "at_risk"
  | "conflict"
  | "masked"
  | "archived";

/** Pastel fills and ink text for calendar / proposal blocks. */
export const SCHEDULE_SEMANTIC_COLORS: Record<
  ScheduleSemanticVariant,
  { fill: string; text: string; borderStyle: "solid" | "dashed" }
> = {
  proposed: { fill: "#F5D76E", text: "#3D3500", borderStyle: "dashed" },
  resolved_event: { fill: "#A8C5A0", text: "#1E3A24", borderStyle: "solid" },
  resolved_sleeping: { fill: "#C4B5E8", text: "#2E2450", borderStyle: "solid" },
  at_risk: { fill: "#F0C878", text: "#4A3800", borderStyle: "dashed" },
  conflict: { fill: "#E8A598", text: "#4A1F18", borderStyle: "solid" },
  masked: { fill: "#E8E2D8", text: "#6B6560", borderStyle: "dashed" },
  archived: { fill: "#D8D4CE", text: "#6B6560", borderStyle: "solid" },
};

/**
 * Network busyness levels for heatmap / month day rings — Garden pastels (PC-164).
 * 0 open → 3 very busy.
 */
export const HEATMAP_LEVEL_COLORS = [
  GARDEN_TOKENS.surface,
  "#D4E5D0",
  SCHEDULE_SEMANTIC_COLORS.proposed.fill,
  SCHEDULE_SEMANTIC_COLORS.conflict.fill,
] as const;
