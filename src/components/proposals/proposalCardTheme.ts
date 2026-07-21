/** Shared PolyCal proposal card palette and helpers — Garden Brutalism (PC-40). */
import { sleepingCalendarDayEnd } from "@/lib/proposals/sleeping-schedule";
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

/** Peach tint when an admin is viewing someone else’s proposal card (PC-196). */
export const ADMIN_OVERSIGHT_BG = "#FFE8D6";

/**
 * Yellow tint for feed comments visible only because the viewer is an admin
 * (e.g. sleeping arrangements under involved-only network visibility) (PC-250).
 */
export const ADMIN_ONLY_FEED_COMMENT_BG = "#FFF59D";

export function formatTimeRange(
  start: string | null,
  end: string | null,
  proposalType: "event" | "sleeping" = "event",
  isAllDay = false,
): string | null {
  if (!start) return null;
  if (proposalType === "sleeping" || isAllDay) {
    const range = formatDateRange(start, end);
    return isAllDay && range ? `All day · ${range}` : range;
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
  specialKind?: "residency",
): string {
  if (specialKind === "residency" || cardKind === "residency") return "RESIDENCY PROPOSAL";
  if (cardKind === "partnership") return "RELATIONSHIP PROPOSAL";
  return type === "sleeping" ? "SLEEPING PROPOSAL" : "EVENT PROPOSAL";
}

/**
 * Sleeping nights are calendar-date-only — a night is only "past" once its whole
 * calendar day has elapsed, not at its (often midnight) start timestamp (PC-280).
 */
export function isPastSchedule(
  startIso: string | undefined,
  proposalType: "event" | "sleeping" = "event",
): boolean {
  if (!startIso) return false;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return false;
  const compareTime =
    proposalType === "sleeping" ? sleepingCalendarDayEnd(startIso).getTime() : start.getTime();
  return compareTime < Date.now();
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

/**
 * True when an admin is viewing a proposal they neither proposed nor are invited to (PC-196 / PC-274).
 */
export function isAdminOversightView(
  isAdmin: boolean,
  currentUserId: string,
  proposerId: string | null | undefined,
  viewerIsInvitee = false,
): boolean {
  return Boolean(
    isAdmin &&
      proposerId &&
      proposerId !== currentUserId &&
      !viewerIsInvitee,
  );
}

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
  specialKind?: "residency",
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

