/** Window event so composer submit can refetch the visible schedule range (PC-474). */
export const SCHEDULE_INVALIDATE_EVENT = "polycal:schedule-invalidate";

/**
 * Asks any mounted ScheduleClient to reload the currently visible fetch window.
 * No-ops on the server. Composer still calls router.refresh() for other RSC lists.
 */
export function invalidateSchedule(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SCHEDULE_INVALIDATE_EVENT));
}
