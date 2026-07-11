import { type Page, expect } from "@playwright/test";

import { fillProposalDateRange, selectDraftScheduleMode } from "./datePickers";
import { goToSchedule } from "./navigation";
import { openEventProposalDraft, submitProposalDraft } from "./proposals";

const SCHEDULE_VIEW_STORAGE_KEY = "polycal.schedule.view";

/** ISO yyyy-MM-dd offset from today. */
export function dateOffsetIso(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Resets persisted schedule layout/filter state so navigation tests start from week view. */
export async function clearScheduleViewState(page: Page): Promise<void> {
  try {
    await page.evaluate((storageKey) => {
      window.localStorage.removeItem(storageKey);
    }, SCHEDULE_VIEW_STORAGE_KEY);
  } catch {
    // Ignore when the page has no storage access yet (e.g. about:blank before login).
  }
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

function dateInRange(isoDate: string, rangeStart: string, rangeEnd: string): boolean {
  const target = parseIsoDate(isoDate).getTime();
  const start = new Date(rangeStart).getTime();
  const end = new Date(rangeEnd).getTime();
  return target >= start && target <= end;
}

function eventLocator(page: Page, namePattern: RegExp) {
  return page
    .getByRole("button", { name: namePattern })
    .or(page.getByTitle(namePattern))
    .first();
}

/** Shifts a yyyy-MM-dd date by a number of calendar days. */
export function shiftIsoDate(isoDate: string, dayDelta: number): string {
  const date = parseIsoDate(isoDate);
  date.setDate(date.getDate() + dayDelta);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Shifts a yyyy-MM-ddTHH:mm datetime by calendar days, preserving clock time. */
export function shiftIsoDateTime(dateTime: string, dayDelta: number): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(dateTime);
  if (!match) {
    throw new Error(`Invalid datetime: ${dateTime}`);
  }
  const [, datePart, hour, minute] = match;
  return `${shiftIsoDate(datePart!, dayDelta)}T${hour}:${minute}`;
}

/** Builds a one-hour timed event window on a day offset from today. */
export function oneHourEventWindow(
  daysFromToday: number,
  startHour = 10,
): { start: string; end: string; day: string } {
  const day = dateOffsetIso(daysFromToday);
  const pad = (value: number) => String(value).padStart(2, "0");
  const endHour = startHour + 1;
  return {
    day,
    start: `${day}T${pad(startHour)}:00`,
    end: `${day}T${pad(endHour)}:00`,
  };
}

/** Forces one-week layout (week calendar + single-week density). */
export async function selectScheduleOneWeekView(page: Page): Promise<void> {
  await page.getByLabel("Calendar layout").getByRole("button", { name: "Week" }).click();
  await page.getByLabel("View density").getByRole("button", { name: "Week", exact: true }).click();
  await waitForScheduleReady(page);
}

/** Forces two-week density within week layout. */
export async function selectScheduleTwoWeekView(page: Page): Promise<void> {
  await page.getByLabel("Calendar layout").getByRole("button", { name: "Week" }).click();
  await page.getByLabel("View density").getByRole("button", { name: "2 weeks" }).click();
  await waitForScheduleReady(page);
}

/** Switches to month layout. */
export async function selectScheduleMonthView(page: Page): Promise<void> {
  await page.getByLabel("Calendar layout").getByRole("button", { name: "Month" }).click();
  await waitForScheduleReady(page);
}

/**
 * Asserts a resolved event title is visible in one-week, two-week, and month schedule views.
 */
export async function assertEventVisibleInAllScheduleViews(
  page: Page,
  titlePattern: RegExp,
  targetDateIso: string,
): Promise<void> {
  await goToSchedule(page);
  await clearScheduleViewState(page);

  for (const selectView of [
    selectScheduleOneWeekView,
    selectScheduleTwoWeekView,
    selectScheduleMonthView,
  ]) {
    await selectView(page);
    await navigateScheduleUntilDateInRange(page, targetDateIso);
    await waitForScheduleReady(page);
    await expect(eventLocator(page, titlePattern)).toBeVisible({ timeout: 20_000 });
  }
}

/** Waits until schedule data has finished loading for the visible range. */
export async function waitForScheduleReady(page: Page): Promise<void> {
  await expect(page.getByTestId("schedule-ready")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

/** Forces week layout so aria-labels and week stepping remain predictable. */
export async function forceWeekLayout(page: Page): Promise<void> {
  const layoutWeek = page.getByLabel("Calendar layout").getByRole("button", { name: "Week" });
  if (await layoutWeek.isVisible().catch(() => false)) {
    const selected = await layoutWeek.getAttribute("aria-pressed");
    if (selected !== "true") {
      await layoutWeek.click();
      await waitForScheduleReady(page);
    }
  }

  const densityWeek = page.getByLabel("View density").getByRole("button", { name: "Week", exact: true });
  if (await densityWeek.isVisible().catch(() => false)) {
    const selected = await densityWeek.getAttribute("aria-pressed");
    if (selected !== "true") {
      await densityWeek.click();
      await waitForScheduleReady(page);
    }
  }
}

async function readVisibleRange(page: Page): Promise<{ start: string; end: string }> {
  const start = await page.getByTestId("schedule-range-start").getAttribute("data-value");
  const end = await page.getByTestId("schedule-range-end").getAttribute("data-value");
  if (!start || !end) {
    throw new Error("Schedule range attributes missing.");
  }
  return { start, end };
}

/**
 * Advances the calendar until the visible range contains `targetDateIso`.
 */
export async function navigateScheduleUntilDateInRange(
  page: Page,
  targetDateIso: string,
  options?: { maxSteps?: number },
): Promise<void> {
  const maxSteps = options?.maxSteps ?? 60;

  for (let step = 0; step < maxSteps; step += 1) {
    await waitForScheduleReady(page);
    const range = await readVisibleRange(page);
    if (dateInRange(targetDateIso, range.start, range.end)) {
      return;
    }

    const next = page.getByRole("button", { name: "Next period" });
    await expect(next).toBeEnabled({ timeout: 15_000 });
    await next.click();
  }

  throw new Error(`Could not navigate schedule to include ${targetDateIso}.`);
}

/**
 * Advances the week calendar toward `targetDateIso` and waits for a matching block.
 */
export async function advanceScheduleUntilEventVisible(
  page: Page,
  namePattern: RegExp,
  options?: { targetDateIso?: string },
): Promise<void> {
  await goToSchedule(page);
  await clearScheduleViewState(page);
  await forceWeekLayout(page);
  await waitForScheduleReady(page);

  if (options?.targetDateIso) {
    await navigateScheduleUntilDateInRange(page, options.targetDateIso);
    await waitForScheduleReady(page);
  }

  await expect(eventLocator(page, namePattern)).toBeVisible({ timeout: 20_000 });
}

/** Creates and submits a resolved solo all-day event spanning multiple calendar days. */
export async function createAndSubmitAllDaySpan(
  page: Page,
  options: { title: string; startDate: string; endDate: string },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  await selectDraftScheduleMode(dialog, "All Day");
  await fillProposalDateRange(dialog, options.startDate, options.endDate);
  await dialog.getByRole("button", { name: "Save" }).click();
  await submitProposalDraft(page, dialog);
}
