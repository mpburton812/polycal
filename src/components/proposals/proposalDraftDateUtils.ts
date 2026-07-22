/**
 * Local date/datetime helpers for proposal draft form inputs (PC-132).
 * Kept pure so draft dialog sections can share without pulling React state.
 */

/** Datetime-local string from ISO (YYYY-MM-DDTHH:mm). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Date-only input for sleeping / all-day proposals (no clock times). */
export function toLocalDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localInputToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function localDateToStartIso(value: string): string | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  // Noon-UTC civil bounds — stable across viewer timezones (PC-258 / PC-301).
  return `${match[1]}-${match[2]}-${match[3]}T12:00:00.000Z`;
}

export function localDateToEndIso(value: string): string | undefined {
  // Same-day all-day uses identical start/end noon bounds so the event never
  // spills into a second civil day in week/agenda placement (PC-239 / PC-301).
  return localDateToStartIso(value);
}

export function slotStartInput(
  iso: string | null | undefined,
  proposalType: "event" | "sleeping",
  isAllDay = false,
): string {
  return proposalType === "sleeping" || isAllDay
    ? toLocalDateInput(iso)
    : toLocalInput(iso);
}

export type InviteeSelection = "none" | "required" | "optional";

export interface SlotDraft {
  startAt: string;
  endAt: string;
  label: string;
}
