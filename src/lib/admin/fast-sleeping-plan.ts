import { z } from "zod";

import { newBatchEntryId, type BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";

const fastSleepingRowSchema = z.object({
  nightDate: z.string().min(1, "Night date is required."),
  inviteeUserIds: z.array(z.string().min(1)).default([]),
  locationId: z.string().optional(),
  locationText: z.string().trim().optional(),
  intentionalSolo: z.boolean().optional(),
});

/** Input for admin fast sleeping plan add (PC-118). */
export const adminFastSleepingPlanSchema = z.object({
  targetUserId: z.string().min(1, "Target user is required."),
  rows: z.array(fastSleepingRowSchema).min(1).max(14),
  confirm: z.boolean().default(false),
});

export type AdminFastSleepingRow = z.infer<typeof fastSleepingRowSchema>;
export type AdminFastSleepingPlanInput = z.infer<typeof adminFastSleepingPlanSchema>;

/** Returns true when a grid row has sleeping plan content configured. */
export function fastSleepingRowHasContent(row: AdminFastSleepingRow): boolean {
  return Boolean(
    row.intentionalSolo ||
      row.inviteeUserIds.length > 0 ||
      row.locationId ||
      row.locationText?.trim(),
  );
}

/** Builds batch sleeping entries from admin grid rows (skips empty nights). */
export function buildBatchEntriesFromAdminRows(rows: AdminFastSleepingRow[]): BatchSleepingEntry[] {
  return rows.filter(fastSleepingRowHasContent).map((row) => ({
    id: newBatchEntryId(),
    nightDate: row.nightDate.slice(0, 10),
    locationId: row.locationId,
    locationText: row.locationText?.trim() || undefined,
    intentionalSolo: Boolean(row.intentionalSolo),
    invitees: row.intentionalSolo
      ? []
      : row.inviteeUserIds.map((userId) => ({ userId, role: "required" as const })),
  }));
}
