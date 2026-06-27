import type { Locator } from "@playwright/test";

/** Converts YYYY-MM-DD to the US MUI dayjs display string. */
function toMuiDateDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

/** Converts YYYY-MM-DDTHH:mm to the US MUI dayjs display string. */
function toMuiDateTimeDisplay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  const [, year, month, day, hour24, minute] = match;
  const hour = Number(hour24);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${month}/${day}/${year} ${String(hour12).padStart(2, "0")}:${minute} ${ampm}`;
}

/** Fills a MUI X DatePicker text field in a proposal draft dialog. */
export async function fillProposalDateField(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.fill(toMuiDateDisplay(value));
  await field.press("Tab");
}

/** Fills a MUI X DateTimePicker text field in a proposal draft dialog. */
export async function fillProposalDateTimeField(
  field: Locator,
  value: string,
): Promise<void> {
  await field.click();
  await field.fill(toMuiDateTimeDisplay(value));
  await field.press("Tab");
}

/** Returns YYYY-MM-DDTHH:mm for a slot in the current calendar week (Mon = 0). */
export function currentWeekDateTime(
  dayOffsetFromMonday: number,
  hour: number,
  minute = 0,
): string {
  const monday = new Date();
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const slot = new Date(monday);
  slot.setDate(slot.getDate() + dayOffsetFromMonday);
  slot.setHours(hour, minute, 0, 0);
  const y = slot.getFullYear();
  const m = String(slot.getMonth() + 1).padStart(2, "0");
  const d = String(slot.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}
