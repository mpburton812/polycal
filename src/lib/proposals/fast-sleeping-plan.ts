import { z } from "zod";

import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import { newBatchEntryId } from "@/lib/proposals/batch-sleeping-client";
import {
  LONG_TEXT_MAX,
  SHORT_TEXT_MAX,
  limitedString,
} from "@/lib/validation/string-limits";

/** Number of civil nights shown in the shared fast sleeping plan grid. */
export const FAST_SLEEPING_GRID_DAYS = 14;

/** Max configured slots (allows multiple arrangements on the same night). */
export const FAST_SLEEPING_MAX_SLOTS = 28;

/** One night row / slot in the shared fast sleeping plan grid (UI/input projection). */
export const fastSleepingRowSchema = z.object({
  /** Stable UI key — required for multi-slot same-date lists (PC-383). */
  id: z.string().min(1).optional(),
  nightDate: z.string().min(1, "Night date is required."),
  /** FastSleep night subject/proposer; defaults to scheduler when omitted. */
  subjectUserId: z.string().min(1).optional(),
  inviteeUserIds: z.array(z.string().min(1)).default([]),
  /** Per-partner role; missing ids default to optional on batch build (PC-374). */
  inviteeRoles: z
    .record(z.string(), z.enum(["required", "optional"]))
    .optional(),
  locationId: z.string().optional(),
  locationText: limitedString("Location", SHORT_TEXT_MAX).optional(),
  intentionalSolo: z.boolean().optional(),
  /** Optional per-slot note → BatchSleepingEntry.comment. */
  comment: limitedString("Comment", LONG_TEXT_MAX).optional(),
});

export type FastSleepingRow = z.infer<typeof fastSleepingRowSchema>;

/** Admin fast-add input: target user + grid rows + conflict confirm (PC-114). */
export const adminFastSleepingPlanSchema = z.object({
  targetUserId: z.string().min(1, "Target user is required."),
  rows: z.array(fastSleepingRowSchema).min(1).max(FAST_SLEEPING_MAX_SLOTS),
  confirm: z.boolean().default(false),
});

export type AdminFastSleepingPlanInput = z.infer<typeof adminFastSleepingPlanSchema>;

/** @deprecated Prefer FastSleepingRow — kept for admin panel import compatibility. */
export type AdminFastSleepingRow = FastSleepingRow;

function formatGridDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Creates an empty slot for a civil night date. */
export function createEmptyFastSleepingRow(
  nightDate: string,
  subjectUserId?: string,
): FastSleepingRow {
  return {
    id: newBatchEntryId(),
    nightDate: nightDate.slice(0, 10),
    subjectUserId,
    inviteeUserIds: [],
    inviteeRoles: {},
    intentionalSolo: false,
  };
}

/** Builds empty grid rows for today through today+13. */
export function buildEmptyGridRows(
  dayCount: number = FAST_SLEEPING_GRID_DAYS,
): FastSleepingRow[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: dayCount }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return createEmptyFastSleepingRow(formatGridDate(day));
  });
}

/** Formats a night date for display in the grid (weekday + short month/day). */
export function formatFastSleepingDayLabel(dateValue: string): string {
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Returns true when a grid row has sleeping plan content configured. */
export function fastSleepingRowHasContent(row: FastSleepingRow): boolean {
  return Boolean(
    row.intentionalSolo ||
      row.inviteeUserIds.length > 0 ||
      row.locationId ||
      row.locationText?.trim() ||
      row.comment?.trim(),
  );
}

/**
 * Builds batch sleeping entries from fast-plan grid rows (skips empty nights).
 * Partners default to optional unless explicitly marked required (PC-374).
 */
export function buildBatchEntriesFromRows(
  rows: FastSleepingRow[],
  defaultSubjectUserId?: string,
): BatchSleepingEntry[] {
  return rows.filter(fastSleepingRowHasContent).map((row) => ({
    id: row.id?.startsWith("bse-") ? row.id : newBatchEntryId(),
    nightDate: row.nightDate.slice(0, 10),
    subjectUserId: row.subjectUserId ?? defaultSubjectUserId,
    locationId: row.locationId,
    locationText: row.locationText?.trim() || undefined,
    intentionalSolo: Boolean(row.intentionalSolo),
    comment: row.comment?.trim() || undefined,
    invitees: row.intentionalSolo
      ? []
      : row.inviteeUserIds.map((userId) => ({
          userId,
          role: (row.inviteeRoles?.[userId] ?? "optional") as "required" | "optional",
        })),
  }));
}

/** @deprecated Prefer buildBatchEntriesFromRows. */
export const buildBatchEntriesFromAdminRows = buildBatchEntriesFromRows;

/**
 * Projects batch entries onto the 14-day grid for edit.
 * Multiple entries on the same nightDate become multiple slots (PC-383).
 */
export function rowsFromBatchEntries(
  entries: BatchSleepingEntry[],
  baseRows: FastSleepingRow[] = buildEmptyGridRows(),
): FastSleepingRow[] {
  const entriesByDate = new Map<string, BatchSleepingEntry[]>();
  for (const entry of entries) {
    const nightDate = entry.nightDate.slice(0, 10);
    const list = entriesByDate.get(nightDate) ?? [];
    list.push(entry);
    entriesByDate.set(nightDate, list);
  }

  const rows: FastSleepingRow[] = [];
  const covered = new Set<string>();

  for (const base of baseRows) {
    const nightDate = base.nightDate.slice(0, 10);
    const nightEntries = entriesByDate.get(nightDate);
    if (!nightEntries || nightEntries.length === 0) {
      rows.push({ ...base, id: base.id ?? newBatchEntryId() });
      continue;
    }
    covered.add(nightDate);
    for (const entry of nightEntries) {
      rows.push(entryToRow(entry));
    }
  }

  for (const [nightDate, nightEntries] of entriesByDate) {
    if (covered.has(nightDate)) continue;
    for (const entry of nightEntries) {
      rows.push(entryToRow(entry));
    }
  }

  return rows.slice(0, FAST_SLEEPING_MAX_SLOTS);
}

function entryToRow(entry: BatchSleepingEntry): FastSleepingRow {
  return {
    id: entry.id,
    nightDate: entry.nightDate.slice(0, 10),
    subjectUserId: entry.subjectUserId,
    inviteeUserIds: entry.intentionalSolo
      ? []
      : entry.invitees.map((invitee) => invitee.userId),
    inviteeRoles: entry.intentionalSolo
      ? {}
      : Object.fromEntries(entry.invitees.map((invitee) => [invitee.userId, invitee.role])),
    locationId: entry.locationId,
    locationText: entry.locationText,
    intentionalSolo: Boolean(entry.intentionalSolo),
    comment: entry.comment,
  };
}
