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
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function localDateToEndIso(value: string): string | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
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
