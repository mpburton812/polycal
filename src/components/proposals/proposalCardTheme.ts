/** Shared PolyCal proposal card palette and helpers — Garden Brutalism (PC-40). */
import {
  EVENT_BLOCK_ROTATIONS,
  GARDEN_TOKENS,
  ORGANIC_RADIUS,
} from "@/theme/tokens";

/** @deprecated Use GARDEN_TOKENS.sage — kept for dialog imports during migration. */
export const POLY_GREEN = GARDEN_TOKENS.sage;
export const POLY_GREEN_HOVER = "#557A5C";
export const POLY_GREEN_LIGHT = "#E8F0E9";
export const PAST_SCHEDULE_BG = "#FDF3D6";
export const PAST_SCHEDULE_TEXT = "#4A3800";
export const PAST_SCHEDULE_ICON = GARDEN_TOKENS.mustard;

export function formatTimeRange(
  start: string | null,
  end: string | null,
  proposalType: "event" | "sleeping" = "event",
): string | null {
  if (!start) return null;
  if (proposalType === "sleeping") {
    return formatDateRange(start, end);
  }
  const startLabel = new Date(start).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!end) return startLabel;
  const endLabel = new Date(end).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${startLabel} – ${endLabel}`;
}

/** Date-only span for sleeping proposals (no clock times). */
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  const startLabel = new Date(start).toLocaleDateString(undefined, dateOpts);
  if (!end) return startLabel;
  const endDate = new Date(end);
  const startDate = new Date(start);
  const sameDay =
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getDate() === endDate.getDate();
  if (sameDay) return startLabel;
  return `${startLabel} – ${endDate.toLocaleDateString(undefined, dateOpts)}`;
}

export function typeBadgeLabel(
  type: string,
  cardKind?: string,
  specialKind?: "residency" | "group_name",
): string {
  if (specialKind === "residency" || cardKind === "residency") return "RESIDENCY PROPOSAL";
  if (specialKind === "group_name") return "GROUP RENAME";
  if (cardKind === "partnership") return "RELATIONSHIP PROPOSAL";
  return type === "sleeping" ? "SLEEPING PROPOSAL" : "EVENT PROPOSAL";
}

export function isPastSchedule(startIso: string | undefined): boolean {
  if (!startIso) return false;
  const start = new Date(startIso);
  return !Number.isNaN(start.getTime()) && start.getTime() < Date.now();
}

/** Deterministic slight tilt for masonry proposal cards. */
export function proposalCardRotation(id: string): string {
  const sum = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return EVENT_BLOCK_ROTATIONS[sum % EVENT_BLOCK_ROTATIONS.length] ?? "0deg";
}

export const proposalCardSx = {
  bgcolor: GARDEN_TOKENS.surface,
  border: `2px solid ${GARDEN_TOKENS.ink}`,
  borderRadius: ORGANIC_RADIUS,
  boxShadow: "none",
} as const;

export const brutalPressSx = {
  transition: "transform 0.12s ease",
  "&:hover": {
    boxShadow: "none",
    transform: "translate(1px, 1px)",
  },
} as const;

export function typeChipSxForProposal(
  proposalType: string,
  cardKind?: string,
  specialKind?: "residency" | "group_name",
) {
  if (specialKind === "residency" || cardKind === "residency" || cardKind === "partnership") {
    return {
      bgcolor: "#F5D76E",
      color: GARDEN_TOKENS.ink,
      border: `2px solid ${GARDEN_TOKENS.ink}`,
      fontWeight: 700,
      fontSize: "0.65rem",
      letterSpacing: 0.5,
    } as const;
  }
  if (proposalType === "sleeping") {
    return {
      bgcolor: "#C4B5E8",
      color: "#2E2450",
      border: `2px solid ${GARDEN_TOKENS.ink}`,
      fontWeight: 700,
      fontSize: "0.65rem",
      letterSpacing: 0.5,
    } as const;
  }
  return {
    bgcolor: "#F5D76E",
    color: "#3D3500",
    border: `2px solid ${GARDEN_TOKENS.ink}`,
    fontWeight: 700,
    fontSize: "0.65rem",
    letterSpacing: 0.5,
  } as const;
}

/** @deprecated Use typeChipSxForProposal */
export const typeChipSx = {
  bgcolor: "#F5D76E",
  color: "#3D3500",
  border: `2px solid ${GARDEN_TOKENS.ink}`,
  fontWeight: 700,
  fontSize: "0.65rem",
  letterSpacing: 0.5,
} as const;

export const primaryButtonSx = {
  bgcolor: GARDEN_TOKENS.sage,
  color: GARDEN_TOKENS.surface,
  border: `2px solid ${GARDEN_TOKENS.ink}`,
  boxShadow: "none",
  "&:hover": {
    bgcolor: POLY_GREEN_HOVER,
    boxShadow: "none",
  },
} as const;

export const outlinedButtonSx = {
  border: `2px solid ${GARDEN_TOKENS.ink}`,
  color: GARDEN_TOKENS.ink,
  boxShadow: "none",
  "&:hover": {
    bgcolor: GARDEN_TOKENS.background,
    boxShadow: "none",
  },
} as const;
