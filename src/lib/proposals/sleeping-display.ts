/**
 * Shared sleeping arrangement title and participant formatting (PC-66 / PC-150 / PC-351).
 *
 * Format:
 *   Sleeping: Name1, Name2[, Status]
 *   Sleeping: Name1, Name2[, Status], at Location
 *
 * Resolved/archived omit status (no "Confirmed"); keep Tentative / Proposed / At risk.
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

/**
 * Derives the status fragment for sleeping display titles.
 * Returns null when resolved/archived (and not at-risk) so Confirmed is omitted (PC-351).
 */
export function sleepingDisplayStatus(
  input: Pick<SleepingDisplayInput, "state" | "atRisk">,
): SleepingDisplayStatus | null {
  if (input.atRisk) return "At risk";
  if (input.state === "resolved" || input.state === "archived") return null;
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
 * Builds the canonical sleeping title string used on cards, schedule, detail, and calendar sync.
 */
export function formatSleepingDisplayTitle(input: SleepingDisplayInput): string {
  const names = formatSleepingParticipantNames(input);
  const status = sleepingDisplayStatus(input);
  let title = status
    ? `Sleeping: ${names.join(", ")}, ${status}`
    : `Sleeping: ${names.join(", ")}`;
  const location = input.locationName?.trim();
  if (location) {
    title += `, at ${location}`;
  }
  return title;
}

/**
 * Strips a trailing ", Confirmed" segment from legacy stored titles before calendar sync (PC-351).
 * Does not remove ", at Location".
 */
export function stripConfirmedFromSleepingTitle(title: string): string {
  return title.replace(/, Confirmed(?=, at |$)/g, "");
}
