import { z } from "zod";

import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import { newBatchEntryId } from "@/lib/proposals/batch-sleeping-client";
import { SHORT_TEXT_MAX, limitedString } from "@/lib/validation/string-limits";

/** Number of nights shown in the shared fast sleeping plan grid. */
export const FAST_SLEEPING_GRID_DAYS = 14;

/** One night row in the shared fast sleeping plan grid (UI/input projection). */
export const fastSleepingRowSchema = z.object({
  nightDate: z.string().min(1, "Night date is required."),
  inviteeUserIds: z.array(z.string().min(1)).default([]),
  /** Per-partner role; missing ids default to optional on batch build (PC-374). */
  inviteeRoles: z.record(z.enum(["required", "optional"])).optional(),
  locationId: z.string().optional(),
  locationText: limitedString("Location", SHORT_TEXT_MAX).optional(),
  intentionalSolo: z.boolean().optional(),
});

export type FastSleepingRow = z.infer<typeof fastSleepingRowSchema>;

/** Admin fast-add input: target user + grid rows + conflict confirm (PC-114). */
export const adminFastSleepingPlanSchema = z.object({
  targetUserId: z.string().min(1, "Target user is required."),
  rows: z.array(fastSleepingRowSchema).min(1).max(FAST_SLEEPING_GRID_DAYS),
  confirm: z.boolean().default(false),
});

export type AdminFastSleepingPlanInput = z.infer<typeof adminFastSleepingPlanSchema>;

/** @deprecated Prefer FastSleepingRow — kept for admin panel import compatibility. */
export type AdminFastSleepingRow = FastSleepingRow;

function formatGridDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
    return {
      nightDate: formatGridDate(day),
      inviteeUserIds: [],
      inviteeRoles: {},
      intentionalSolo: false,
    };
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
      row.locationText?.trim(),
  );
}

/**
 * Builds batch sleeping entries from fast-plan grid rows (skips empty nights).
 * Partners default to optional unless explicitly marked required (PC-374).
 */
export function buildBatchEntriesFromRows(rows: FastSleepingRow[]): BatchSleepingEntry[] {
  return rows.filter(fastSleepingRowHasContent).map((row) => ({
    id: newBatchEntryId(),
    nightDate: row.nightDate.slice(0, 10),
    locationId: row.locationId,
    locationText: row.locationText?.trim() || undefined,
    intentionalSolo: Boolean(row.intentionalSolo),
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
 * Projects existing batch entries onto a fixed 14-day grid (for draft edit).
 * Nights outside the grid window are appended after the fixed days.
 */
export function rowsFromBatchEntries(
  entries: BatchSleepingEntry[],
  baseRows: FastSleepingRow[] = buildEmptyGridRows(),
): FastSleepingRow[] {
  const byDate = new Map(
    entries.map((entry) => [
      entry.nightDate.slice(0, 10),
      {
        nightDate: entry.nightDate.slice(0, 10),
        inviteeUserIds: entry.intentionalSolo
          ? []
          : entry.invitees.map((invitee) => invitee.userId),
        inviteeRoles: entry.intentionalSolo
          ? {}
          : Object.fromEntries(
              entry.invitees.map((invitee) => [invitee.userId, invitee.role]),
            ),
        locationId: entry.locationId,
        locationText: entry.locationText,
        intentionalSolo: Boolean(entry.intentionalSolo),
      } satisfies FastSleepingRow,
    ]),
  );

  const rows = baseRows.map((row) => byDate.get(row.nightDate) ?? row);
  const covered = new Set(rows.map((row) => row.nightDate));
  for (const [nightDate, row] of byDate) {
    if (!covered.has(nightDate)) {
      rows.push(row);
    }
  }
  return rows.slice(0, FAST_SLEEPING_GRID_DAYS);
}
