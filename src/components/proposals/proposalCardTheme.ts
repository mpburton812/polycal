/** Shared PolyCal proposal card palette and helpers (PC-40). */
export const POLY_GREEN = "#004d40";
export const POLY_GREEN_HOVER = "#00332c";
export const POLY_GREEN_LIGHT = "#e0f2f1";
export const PAST_SCHEDULE_BG = "#fff8e1";
export const PAST_SCHEDULE_TEXT = "#f57f17";
export const PAST_SCHEDULE_ICON = "#f9a825";

export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
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

export function typeBadgeLabel(type: string): string {
  return type === "sleeping" ? "SLEEPING PROPOSAL" : "EVENT PROPOSAL";
}

export function isPastSchedule(startIso: string | undefined): boolean {
  if (!startIso) return false;
  const start = new Date(startIso);
  return !Number.isNaN(start.getTime()) && start.getTime() < Date.now();
}

export const proposalCardSx = {
  borderLeft: `4px solid ${POLY_GREEN}`,
  borderRadius: 2,
} as const;

export const typeChipSx = {
  bgcolor: POLY_GREEN_LIGHT,
  color: POLY_GREEN,
  fontWeight: 700,
  fontSize: "0.65rem",
  letterSpacing: 0.5,
} as const;

export const primaryButtonSx = {
  bgcolor: POLY_GREEN,
  "&:hover": { bgcolor: POLY_GREEN_HOVER },
} as const;
