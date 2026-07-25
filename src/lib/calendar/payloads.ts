/**
 * Builds Google Calendar / ICS event payloads from PolyCal proposals (PC-338 / PC-351).
 */
import type { proposals } from "@/lib/db/schema";
import {
  parseBatchEntriesJson,
  type BatchSleepingEntry,
} from "@/lib/proposals/batch-sleeping";
import {
  formatSleepingDisplayTitle,
  stripConfirmedFromSleepingTitle,
} from "@/lib/proposals/sleeping-display";

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
  /**
   * Stable key for multi-event sync (PC-351).
   * Empty string for non-batch / single span; YYYY-MM-DD for each batch night.
   */
  nightKey: string;
}

/** Names needed to build per-night sleeping titles during sync. */
export interface CalendarPayloadNameContext {
  proposerName: string;
  /** displayName by userId for invitees (and proposer if useful). */
  displayNameByUserId: Record<string, string>;
  /** Proposal-level invitee display names (non-batch sleeping titles). */
  proposalInviteeNames?: string[];
}

/**
 * Maps a resolved proposal to external calendar payload(s).
 * Non-batch sleeping / events → one payload. Batch sleeping → one all-day free payload per night.
 */
export function buildCalendarEventPayloads(
  proposal: ProposalRow,
  nameCtx?: CalendarPayloadNameContext,
  recipientUserId?: string,
): CalendarEventPayload[] {
  if (proposal.proposalType === "sleeping" && proposal.isBatchSleeping) {
    return buildBatchSleepingPayloads(proposal, nameCtx, recipientUserId);
  }

  const single = buildSingleCalendarEventPayload(proposal, nameCtx);
  return single ? [single] : [];
}

/**
 * Backward-compatible single-payload helper (non-batch paths / tests).
 */
export function buildCalendarEventPayload(
  proposal: ProposalRow,
  nameCtx?: CalendarPayloadNameContext,
): CalendarEventPayload | null {
  const list = buildCalendarEventPayloads(proposal, nameCtx);
  return list[0] ?? null;
}

function buildSingleCalendarEventPayload(
  proposal: ProposalRow,
  nameCtx?: CalendarPayloadNameContext,
): CalendarEventPayload | null {
  if (!proposal.scheduledStartAt) return null;

  const isSleeping = proposal.proposalType === "sleeping";
  const startAt = proposal.scheduledStartAt;
  let endAt = proposal.scheduledEndAt;
  let isAllDay = proposal.isAllDay || isSleeping;

  if (isSleeping) {
    isAllDay = true;
    if (!endAt || endAt === startAt) {
      const day = startAt.slice(0, 10);
      endAt = `${day}T00:00:00.000Z`;
    }
  }

  const location = proposal.locationText?.trim() || null;
  const title = isSleeping
    ? sleepingCalendarTitle(proposal, location, nameCtx)
    : proposal.title;

  return {
    title,
    description: proposal.description ?? undefined,
    location,
    startAt,
    endAt,
    isAllDay,
    transparencyFree: isSleeping,
    proposalType: proposal.proposalType,
    nightKey: "",
  };
}

function buildBatchSleepingPayloads(
  proposal: ProposalRow,
  nameCtx?: CalendarPayloadNameContext,
  recipientUserId?: string,
): CalendarEventPayload[] {
  const entries = parseBatchEntriesJson(proposal.batchEntriesJson);
  if (entries.length === 0) {
    // Fallback: treat as single span using scheduled bounds.
    const single = buildSingleCalendarEventPayload(proposal, nameCtx);
    return single ? [single] : [];
  }

  const sorted = [...entries].sort((a, b) => a.nightDate.localeCompare(b.nightDate));
  const payloads: CalendarEventPayload[] = [];

  for (const entry of sorted) {
    if (recipientUserId && !userOnBatchNight(proposal.proposerId, entry, recipientUserId)) {
      continue;
    }
    const nightKey = entry.nightDate.slice(0, 10);
    const startAt = `${nightKey}T00:00:00.000Z`;
    const location = entry.locationText?.trim() || null;
    const title = batchNightTitle(proposal, entry, location, nameCtx);

    payloads.push({
      title,
      description: entry.comment?.trim() || proposal.description || undefined,
      location,
      startAt,
      endAt: startAt,
      isAllDay: true,
      transparencyFree: true,
      proposalType: "sleeping",
      nightKey,
    });
  }

  return payloads;
}

function userOnBatchNight(
  proposerId: string,
  entry: BatchSleepingEntry,
  userId: string,
): boolean {
  if (userId === proposerId) return true;
  if (entry.intentionalSolo) return false;
  return entry.invitees.some((inv) => inv.userId === userId);
}

function sleepingCalendarTitle(
  proposal: ProposalRow,
  location: string | null,
  nameCtx?: CalendarPayloadNameContext,
): string {
  if (nameCtx?.proposerName) {
    return formatSleepingDisplayTitle({
      proposerName: nameCtx.proposerName,
      inviteeNames: proposal.intentionalSolo ? [] : (nameCtx.proposalInviteeNames ?? []),
      intentionalSolo: proposal.intentionalSolo,
      locationName: location,
      state: proposal.state,
      atRisk: proposal.atRisk,
    });
  }
  return stripConfirmedFromSleepingTitle(proposal.title);
}

function batchNightTitle(
  proposal: ProposalRow,
  entry: BatchSleepingEntry,
  location: string | null,
  nameCtx?: CalendarPayloadNameContext,
): string {
  if (!nameCtx?.proposerName) {
    return stripConfirmedFromSleepingTitle(proposal.title);
  }
  const inviteeNames = entry.intentionalSolo
    ? []
    : entry.invitees
        .map((inv) => nameCtx.displayNameByUserId[inv.userId])
        .filter((n): n is string => Boolean(n?.trim()));

  return formatSleepingDisplayTitle({
    proposerName: nameCtx.proposerName,
    inviteeNames,
    intentionalSolo: Boolean(entry.intentionalSolo),
    locationName: location,
    state: proposal.state,
    atRisk: proposal.atRisk,
  });
}

/** Stable ICS UID per user + proposal (+ optional night key for batch). */
export function buildIcsUid(userId: string, proposalId: string, nightKey = ""): string {
  const night = nightKey.trim() ? `-${nightKey.trim()}` : "";
  return `polycal-${proposalId}${night}-${userId}@polycal.app`;
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
