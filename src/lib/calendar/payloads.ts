/**
 * Builds Google Calendar / ICS event payloads from PolyCal proposals (PC-338).
 */
import type { proposals } from "@/lib/db/schema";

export type ProposalRow = typeof proposals.$inferSelect;

export interface CalendarEventPayload {
  title: string;
  description?: string;
  location?: string | null;
  startAt: string;
  endAt: string | null;
  isAllDay: boolean;
  /** When true, mark free/transparent (sleeping arrangements). */
  transparencyFree: boolean;
  proposalType: "event" | "sleeping";
}

/**
 * Maps a resolved proposal to an external calendar payload.
 * Sleeping: all-day + free/transparent; title is the PolyCal sleeping title as stored.
 */
export function buildCalendarEventPayload(proposal: ProposalRow): CalendarEventPayload | null {
  if (!proposal.scheduledStartAt) return null;

  const isSleeping = proposal.proposalType === "sleeping";
  const startAt = proposal.scheduledStartAt;
  let endAt = proposal.scheduledEndAt;
  let isAllDay = proposal.isAllDay || isSleeping;

  if (isSleeping) {
    isAllDay = true;
    // All-day exclusive end: if only a night start, span that calendar day.
    if (!endAt || endAt === startAt) {
      const day = startAt.slice(0, 10);
      endAt = `${day}T00:00:00.000Z`;
      // Caller formats all-day end as next day exclusive in adapters.
    }
  }

  return {
    title: proposal.title,
    description: proposal.description ?? undefined,
    location: proposal.locationText,
    startAt,
    endAt,
    isAllDay,
    transparencyFree: isSleeping,
    proposalType: proposal.proposalType,
  };
}

/** Stable ICS UID per user + proposal. */
export function buildIcsUid(userId: string, proposalId: string): string {
  return `polycal-${proposalId}-${userId}@polycal.app`;
}

/** YYYYMMDD for all-day ICS/Google date fields. */
export function toAllDayDate(iso: string): string {
  return iso.slice(0, 10).replaceAll("-", "");
}

/** Add one calendar day to a YYYY-MM-DD (or ISO) date for exclusive all-day ends. */
export function nextAllDayDate(isoOrYmd: string): string {
  const ymd = isoOrYmd.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Formats an instant as UTC ICS timestamp. */
export function toIcsUtc(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}
