/**
 * Sleeping-proposal attendee management helpers (PC-64).
 * Passive event auto-accept was removed in favor of proxy voting by the adder (PC-246).
 */

/**
 * Returns whether a sleeping proposal allows attendee management for the viewer (PC-64).
 */
export function canManageSleepingAttendees(isProposer: boolean, isAdmin: boolean): boolean {
  return isProposer || isAdmin;
}
