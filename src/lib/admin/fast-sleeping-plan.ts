/**
 * Re-export shared fast sleeping plan domain from proposals (PC-114).
 * Prefer importing from `@/lib/proposals/fast-sleeping-plan`.
 */
export {
  adminFastSleepingPlanSchema,
  buildBatchEntriesFromAdminRows,
  buildBatchEntriesFromRows,
  buildEmptyGridRows,
  fastSleepingRowHasContent,
  fastSleepingRowSchema,
  formatFastSleepingDayLabel,
  rowsFromBatchEntries,
  FAST_SLEEPING_GRID_DAYS,
  type AdminFastSleepingPlanInput,
  type AdminFastSleepingRow,
  type FastSleepingRow,
} from "@/lib/proposals/fast-sleeping-plan";
