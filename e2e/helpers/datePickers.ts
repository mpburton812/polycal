import type { Locator } from "@playwright/test";

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

/** Fills a MUI X DateTimePicker text field in a proposal draft dialog. */
export async function fillProposalDateTimeField(
  field: Locator,
  value: string,
): Promise<void> {
  await field.click();
  await field.fill(toMuiDateTimeDisplay(value));
  await field.press("Tab");
}
