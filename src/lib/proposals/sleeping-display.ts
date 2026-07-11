/**
 * Shared sleeping arrangement title and participant formatting (PC-66 / PC-150).
 *
 * Format:
 *   Sleeping: Name1, Name2, Status
 *   Sleeping: Name1, Name2, Status, at Location
 */

export type SleepingDisplayStatus = "Confirmed" | "Tentative" | "Proposed" | "At risk";

export interface SleepingDisplayInput {
  proposerName: string;
  inviteeNames?: string[];
  intentionalSolo?: boolean;
  locationName?: string | null;
  state?: "draft" | "proposed" | "resolved" | "archived";
  atRisk?: boolean;
}

/** Derives the status fragment for sleeping display titles. */
export function sleepingDisplayStatus(
  input: Pick<SleepingDisplayInput, "state" | "atRisk">,
): SleepingDisplayStatus {
  if (input.atRisk) return "At risk";
  if (input.state === "resolved" || input.state === "archived") return "Confirmed";
  if (input.state === "proposed") return "Tentative";
  return "Proposed";
}

/** Ordered participant display names — solo uses proposer only, never "self"/"Solo"/"You". */
export function formatSleepingParticipantNames(input: SleepingDisplayInput): string[] {
  if (input.intentionalSolo) {
    return [input.proposerName];
  }
  const names = [input.proposerName, ...(input.inviteeNames ?? [])];
  return [...new Set(names.filter((name) => Boolean(name?.trim())))];
}

/**
 * Builds the canonical sleeping title string used on cards, schedule, and detail views.
 */
export function formatSleepingDisplayTitle(input: SleepingDisplayInput): string {
  const names = formatSleepingParticipantNames(input);
  const status = sleepingDisplayStatus(input);
  let title = `Sleeping: ${names.join(", ")}, ${status}`;
  const location = input.locationName?.trim();
  if (location) {
    title += `, at ${location}`;
  }
  return title;
}
