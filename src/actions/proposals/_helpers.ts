import { getDb } from "@/lib/db/client";
import { proposals, type ProposalType } from "@/lib/db/schema";
import { getAcceptedSleepingPartnerIds as loadAcceptedSleepingPartnerIds } from "@/lib/proposals/partners";
import type { ProposalPlaceOption, RecurrencePattern, RecurrenceRule } from "./types";

export function parseRecurrenceRule(raw: string | null): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RecurrenceRule;
    if (!parsed.pattern || !parsed.count) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeRecurrenceRule(rule: RecurrenceRule | undefined): string | null {
  if (!rule) return null;
  return JSON.stringify(rule);
}

export function advanceOccurrenceDate(date: Date, pattern: RecurrencePattern, interval: number): Date {
  const next = new Date(date);
  switch (pattern) {
    case "daily":
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * interval);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + interval);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + interval);
      break;
    default:
      break;
  }
  return next;
}

/** Builds ISO occurrence windows from the first slot and recurrence rule (PC-40). */
export function buildRecurrenceOccurrences(
  baseStart: string,
  baseEnd: string | null,
  rule: RecurrenceRule,
): { startAt: string; endAt: string | null }[] {
  const occurrences: { startAt: string; endAt: string | null }[] = [];
  let cursorStart = new Date(baseStart);
  let cursorEnd = baseEnd ? new Date(baseEnd) : null;
  const durationMs =
    cursorEnd && !Number.isNaN(cursorEnd.getTime())
      ? cursorEnd.getTime() - cursorStart.getTime()
      : 0;

  for (let index = 0; index < rule.count; index += 1) {
    const startAt = cursorStart.toISOString();
    const endAt =
      cursorEnd && durationMs > 0
        ? new Date(cursorStart.getTime() + durationMs).toISOString()
        : baseEnd;
    occurrences.push({ startAt, endAt: endAt ?? null });
    if (index < rule.count - 1) {
      cursorStart = advanceOccurrenceDate(cursorStart, rule.pattern, rule.interval);
      if (cursorEnd) {
        cursorEnd = advanceOccurrenceDate(cursorEnd, rule.pattern, rule.interval);
      }
    }
  }
  return occurrences;
}

export function slotsFingerprint(
  slots: { startAt: string; endAt?: string | null; label?: string | null }[],
): string {
  return slots
    .map((slot) => `${slot.startAt}|${slot.endAt ?? ""}|${slot.label ?? ""}`)
    .sort()
    .join(";");
}

/** Returns true when time, location, or poll slots changed enough to wipe votes (PC-40). */
export function criticalProposalFieldsChanged(
  before: typeof proposals.$inferSelect,
  afterLocationId: string | null,
  afterSlots: { startAt: string; endAt?: string | null; label?: string | null }[],
  beforeSlots: { startAt: string; endAt: string | null; label: string | null }[],
): boolean {
  if ((before.locationId ?? null) !== afterLocationId) return true;
  if (slotsFingerprint(beforeSlots) !== slotsFingerprint(afterSlots)) return true;
  if (
    before.scheduledStartAt &&
    afterSlots[0] &&
    before.scheduledStartAt !== afterSlots[0].startAt
  ) {
    return true;
  }
  return false;
}

/** Parses bedroom label JSON stored on locations (PC-40). */
export function parseBedroomNames(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function mapPlaceOption(row: {
  id: string;
  name: string;
  bedroomCount: number;
  bedroomNames: string | null;
  owners?: string[];
  residents?: string[];
  residentUserIds?: string[];
}): ProposalPlaceOption {
  const names = parseBedroomNames(row.bedroomNames);
  return {
    id: row.id,
    name: row.name,
    bedroomCount: row.bedroomCount,
    bedroomNames:
      names.length > 0
        ? names
        : Array.from({ length: row.bedroomCount }, (_, index) => `Bedroom ${index + 1}`),
    owners: row.owners ?? [],
    residents: row.residents ?? [],
    residentUserIds: row.residentUserIds ?? [],
  };
}

/**
 * Attaches accepted owner/resident display names to place options (PC-190).
 */
export async function enrichPlaceOptionsWithMembers(
  db: ReturnType<typeof getDb>,
  options: ProposalPlaceOption[],
): Promise<ProposalPlaceOption[]> {
  if (options.length === 0) return options;
  const { listAcceptedPlaceMembersByLocationIds } = await import("@/lib/places/membership");
  const membersByPlace = await listAcceptedPlaceMembersByLocationIds(
    db,
    options.map((option) => option.id),
  );
  return options.map((option) => {
    const members = membersByPlace.get(option.id) ?? { owners: [], residents: [] };
    return { ...option, owners: members.owners, residents: members.residents };
  });
}

/**
 * Sleeping proposals may only invite accepted sleeping partners of the subject
 * (proposer, or Booking-for target) — or be solo (PC-494).
 */
export async function assertSleepingInviteesAllowed(
  db: ReturnType<typeof getDb>,
  subjectUserId: string,
  proposalType: ProposalType,
  intentionalSolo: boolean,
  invitees: { userId: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (proposalType !== "sleeping") return { ok: true };
  if (intentionalSolo || invitees.length === 0) return { ok: true };

  const partners = await loadAcceptedSleepingPartnerIds(db, subjectUserId);
  for (const invitee of invitees) {
    if (!partners.has(invitee.userId)) {
      return {
        ok: false,
        error:
          "Sleeping arrangements can only include people you have an accepted sleeping partnership with, or be solo.",
      };
    }
  }
  return { ok: true };
}
