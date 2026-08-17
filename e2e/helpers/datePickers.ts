import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

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
  const dialog = field.page().getByRole("dialog");
  const pollPressed =
    (await dialog.getByRole("button", { name: "Poll", exact: true }).getAttribute("aria-pressed").catch(
      () => null,
    )) === "true";
  // Recurring is disabled until Window/All Day; do not steal Poll drafts back to Window (PC-422).
  const windowBtn = dialog.getByRole("button", { name: "Window", exact: true });
  if (
    !pollPressed &&
    (await windowBtn.count()) > 0 &&
    !(await field.isVisible().catch(() => false))
  ) {
    await selectDraftScheduleMode(dialog, "Window");
  }
  await field.click();
  await field.fill(toMuiDateTimeDisplay(value));
  await field.press("Tab");
}

/**
 * Navigates a MUI DateCalendar to the month containing `iso` (YYYY-MM-DD).
 */
async function navigateCalendarToMonth(calendar: Locator, iso: string): Promise<void> {
  const year = iso.slice(0, 4);
  const monthIndex = Number(iso.slice(5, 7)) - 1;
  const monthName = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][monthIndex]!;

  const labelButton = calendar.locator(".MuiPickersCalendarHeader-label").first();
  await expect(labelButton).toBeVisible({ timeout: 5_000 });
  const labelText = (await labelButton.textContent()) ?? "";
  if (labelText.includes(monthName) && labelText.includes(year)) {
    return;
  }

  // Open year view, pick year, then month.
  await labelButton.click();
  const yearButton = calendar.getByRole("radio", { name: year, exact: true });
  if (await yearButton.isVisible().catch(() => false)) {
    await yearButton.click();
  } else {
    // Fallback: scroll year list / click by text.
    await calendar.getByText(year, { exact: true }).first().click();
  }

  const monthButton = calendar.getByRole("radio", { name: monthName, exact: true });
  if (await monthButton.isVisible().catch(() => false)) {
    await monthButton.click();
  } else {
    await calendar.getByText(monthName.slice(0, 3), { exact: true }).first().click();
  }

  await expect(labelButton).toContainText(year, { timeout: 5_000 });
}

/**
 * Fills the all-day / sleeping date range fields (PC-153).
 * Prefers ISO text inputs for reliability; falls back to calendar clicks.
 */
export async function fillProposalDateRange(
  dialog: Locator,
  startIso: string,
  endIso?: string,
): Promise<void> {
  const allDayBtn = dialog.getByRole("button", { name: "All Day", exact: true });
  const startProbe = dialog.getByTestId("date-range-start").first();
  if (
    (await allDayBtn.count()) > 0 &&
    !(await startProbe.isVisible().catch(() => false)) &&
    (await allDayBtn.getAttribute("aria-pressed")) !== "true"
  ) {
    await selectDraftScheduleMode(dialog, "All Day");
  }
  const startField = dialog.getByTestId("date-range-start").first();
  const endField = dialog.getByTestId("date-range-end").first();
  if (await startField.isVisible().catch(() => false)) {
    await startField.click();
    await startField.fill(startIso);
    await startField.press("Tab");
    // Same-day all-day must keep end=start. Clearing end on redraft drops the event off the calendar (PC-239).
    const endValue = endIso && endIso !== startIso ? endIso : startIso;
    await endField.click();
    await endField.fill(endValue);
    await endField.press("Tab");
    return;
  }

  const calendar = dialog.locator(".MuiDateCalendar-root").first();
  await expect(calendar).toBeVisible({ timeout: 10_000 });

  async function clickDay(dayNumber: string) {
    const cell = calendar.getByRole("gridcell", { name: dayNumber, exact: true });
    await expect(cell).toBeVisible({ timeout: 5_000 });
    await cell.click();
  }

  await navigateCalendarToMonth(calendar, startIso);
  await clickDay(String(Number(startIso.slice(8, 10))));

  if (endIso && endIso !== startIso) {
    await navigateCalendarToMonth(calendar, endIso);
    await clickDay(String(Number(endIso.slice(8, 10))));
  } else {
    await clickDay(String(Number(startIso.slice(8, 10))));
  }
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

/** Returns YYYY-MM-DDTHH:mm relative to now in America/New_York (PC-408). */
export function minutesFromNowDateTime(minutesFromNow: number): string {
  const slot = new Date(Date.now() + minutesFromNow * 60_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(slot);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Selects Window / All Day / Poll on the exclusive timing group, or toggles Recurring (PC-170). */
export async function selectDraftScheduleMode(
  dialog: Locator,
  mode: "Window" | "All Day" | "Poll" | "Recurring",
): Promise<void> {
  if (mode === "Recurring") {
    const recurring = dialog.getByRole("button", { name: "Recurring", exact: true });
    // Recurring stays disabled until Window or All Day is chosen (PC-422).
    if (await recurring.isDisabled()) {
      const allDayOn =
        (await dialog.getByRole("button", { name: "All Day", exact: true }).getAttribute(
          "aria-pressed",
        )) === "true";
      if (!allDayOn) {
        await dialog.getByRole("button", { name: "Window", exact: true }).click();
        await expect(dialog.getByRole("button", { name: "Window", exact: true })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      }
    }
    await recurring.click();
    await expect(recurring).toHaveAttribute("aria-pressed", "true");
    return;
  }
  await dialog.getByRole("button", { name: mode, exact: true }).click();
  await expect(dialog.getByRole("button", { name: mode, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
}

/** Page-scoped alias for schedule mode selection. */
export async function selectDraftScheduleModeOnPage(
  page: Page,
  mode: "Window" | "All Day" | "Poll" | "Recurring",
): Promise<void> {
  await selectDraftScheduleMode(page.getByRole("dialog"), mode);
}
