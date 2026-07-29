import { type Page, expect } from "@playwright/test";

import { fillProposalDateRange, selectDraftScheduleMode } from "./datePickers";
import { goToSchedule } from "./navigation";
import { openEventProposalDraft, submitProposalDraft } from "./proposals";

const SCHEDULE_VIEW_STORAGE_KEY = "polycal.schedule.view";

/**
 * Dismisses an MOTD pop-up if present so it cannot block schedule / nav clicks (PC-392).
 */
export async function dismissMotdDialogIfOpen(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: /^(Platform|Network) message$/ }),
  });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "OK" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 }).catch(() => {});
  }
}

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
      if (window.location.pathname === "/schedule" && window.location.search) {
        window.history.replaceState(window.history.state, "", "/schedule");
      }
    }, SCHEDULE_VIEW_STORAGE_KEY);
  } catch {
    // Ignore when the page has no storage access yet (e.g. about:blank before login).
  }
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

function dateInRange(isoDate: string, rangeStart: string, rangeEnd: string): boolean {
  // Target noon-UTC vs fetch bounds (viewer-TZ midnight→EOD) — stable on UTC CI (PC-376).
  const target = Date.parse(`${isoDate.slice(0, 10)}T12:00:00.000Z`);
  const start = Date.parse(rangeStart);
  const end = Date.parse(rangeEnd);
  return target >= start && target <= end;
}

function eventLocator(page: Page, namePattern: RegExp) {
  // Week/day blocks use aria-label "Title[, Location][, Tentative]. …"; month chips use title/aria-label.
  return page
    .getByRole("button", { name: namePattern })
    .or(page.getByTitle(namePattern))
    .or(page.getByLabel(namePattern))
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

/**
 * Builds a timed self-appointment window starting `daysFromToday` at `startHour`
 * and lasting `durationHours` (crosses midnight when needed).
 */
export function timedAppointmentWindow(
  daysFromToday: number,
  startHour: number,
  durationHours: number,
): { start: string; end: string; startDay: string; endDay: string } {
  const pad = (value: number) => String(value).padStart(2, "0");
  const startDay = dateOffsetIso(daysFromToday);
  const start = `${startDay}T${pad(startHour)}:00`;
  // Apply duration via Date arithmetic so 23:00 + 1h → next calendar day 00:00.
  const [datePart, timePart] = start.split("T") as [string, string];
  const [hour, minute] = timePart.split(":").map(Number) as [number, number];
  const endDate = parseIsoDate(datePart);
  endDate.setHours(hour + durationHours, minute, 0, 0);
  const endDay = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
  const endTime = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  return {
    start,
    end: `${endDay}T${endTime}`,
    startDay,
    endDay,
  };
}

/**
 * Confirms an event appears when the schedule is navigated to each listed day (PC-326).
 * Uses week layout — Day hour-grid scrolls away from midnight / 11pm without extra scroll.
 */
export async function assertEventOnCalendarDays(
  page: Page,
  titlePattern: RegExp,
  dayIsos: string[],
): Promise<void> {
  await dismissMotdDialogIfOpen(page);
  for (const dayIso of dayIsos) {
    await advanceScheduleUntilEventVisible(page, titlePattern, { targetDateIso: dayIso });
  }
}

/** Forces day hour-grid layout (PC-204). */
export async function selectScheduleDayView(page: Page): Promise<void> {
  await page.getByLabel("Calendar period").getByRole("button", { name: "Day", exact: true }).click();
  await waitForScheduleReady(page);
}

/** Forces one-week layout (week calendar, not 2-week or month). */
export async function selectScheduleOneWeekView(page: Page): Promise<void> {
  await page.getByLabel("Calendar period").getByRole("button", { name: "Week", exact: true }).click();
  await waitForScheduleReady(page);
}

/** Forces two-week density. */
export async function selectScheduleTwoWeekView(page: Page): Promise<void> {
  await page.getByLabel("Calendar period").getByRole("button", { name: "2 weeks" }).click();
  await waitForScheduleReady(page);
}

/** Switches to month layout. */
export async function selectScheduleMonthView(page: Page): Promise<void> {
  await page.getByLabel("Calendar period").getByRole("button", { name: "Month" }).click();
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
  // Clear persisted layout, then hard-load so ScheduleClient mounts clean (PC-239).
  await page.goto("/schedule");
  await expect(page).toHaveURL(/\/schedule/);
  await clearScheduleViewState(page);
  await page.reload();
  await waitForScheduleReady(page);

  for (const selectView of [
    selectScheduleOneWeekView,
    selectScheduleTwoWeekView,
    selectScheduleMonthView,
  ]) {
    await expectEventVisibleInView(page, titlePattern, targetDateIso, selectView);
  }
}

/**
 * Selects a layout, navigates to `targetDateIso`, and asserts the event is visible.
 * Reloads once on miss — CI can serve a stale slice after redraft / soft nav.
 */
async function expectEventVisibleInView(
  page: Page,
  titlePattern: RegExp,
  targetDateIso: string,
  selectView: (page: Page) => Promise<void>,
): Promise<void> {
  await selectView(page);
  await navigateScheduleUntilDateInRange(page, targetDateIso);
  await waitForScheduleReady(page);

  const locator = eventLocator(page, titlePattern);
  try {
    await expect(locator).toBeVisible({ timeout: 15_000 });
    return;
  } catch {
    // Fall through to hard recovery below.
  }

  await clearScheduleViewState(page);
  await page.goto("/schedule");
  await waitForScheduleReady(page);
  await selectView(page);
  await navigateScheduleUntilDateInRange(page, targetDateIso);
  await waitForScheduleReady(page);
  await expect(eventLocator(page, titlePattern)).toBeVisible({ timeout: 25_000 });
}

/** Waits until schedule data has finished loading for the visible range. */
export async function waitForScheduleReady(page: Page): Promise<void> {
  await dismissMotdDialogIfOpen(page);
  // Prefer the last marker — soft navigations can briefly leave a stale node in the DOM.
  await expect(page.getByTestId("schedule-ready").last()).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
}

/** Forces week layout so aria-labels and week stepping remain predictable. */
export async function forceWeekLayout(page: Page): Promise<void> {
  const layoutWeek = page
    .getByLabel("Calendar period")
    .getByRole("button", { name: "Week", exact: true });
  if (await layoutWeek.isVisible().catch(() => false)) {
    const selected = await layoutWeek.getAttribute("aria-pressed");
    if (selected !== "true") {
      await layoutWeek.click();
      await waitForScheduleReady(page);
    }
  }
}

async function readVisibleRange(page: Page): Promise<{ start: string; end: string }> {
  // Prefer .last() — soft navigations / remounts can leave a stale range marker in the DOM.
  const start = await page.getByTestId("schedule-range-start").last().getAttribute("data-value");
  const end = await page.getByTestId("schedule-range-end").last().getAttribute("data-value");
  if (!start || !end) {
    throw new Error("Schedule range attributes missing.");
  }
  return { start, end };
}

/**
 * Advances the calendar until the visible range contains `targetDateIso`.
 * Steps forward or backward so near-term and far-future targets both work.
 */
export async function navigateScheduleUntilDateInRange(
  page: Page,
  targetDateIso: string,
  options?: { maxSteps?: number },
): Promise<void> {
  const maxSteps = options?.maxSteps ?? 60;
  const target = parseIsoDate(targetDateIso).getTime();

  for (let step = 0; step < maxSteps; step += 1) {
    await waitForScheduleReady(page);
    const range = await readVisibleRange(page);
    if (dateInRange(targetDateIso, range.start, range.end)) {
      return;
    }

    const rangeStart = new Date(range.start).getTime();
    const goingForward = target > rangeStart;
    const navLabel = goingForward ? "Next period" : "Previous period";
    const nav = page.getByRole("button", { name: navLabel });
    await expect(nav).toBeEnabled({ timeout: 15_000 });
    await nav.click();
  }

  throw new Error(`Could not navigate schedule to include ${targetDateIso}.`);
}

/**
 * Advances the week calendar toward `targetDateIso` and waits for a matching block.
 * Reloads once on miss — CI can serve a stale week slice after proposal resolve (PC-326 flake).
 */
export async function advanceScheduleUntilEventVisible(
  page: Page,
  namePattern: RegExp,
  options?: { targetDateIso?: string },
): Promise<void> {
  const prepare = async () => {
    await goToSchedule(page);
    await clearScheduleViewState(page);
    await dismissMotdDialogIfOpen(page);
    await forceWeekLayout(page);
    await waitForScheduleReady(page);

    if (options?.targetDateIso) {
      await navigateScheduleUntilDateInRange(page, options.targetDateIso);
      await waitForScheduleReady(page);
    }
  };

  await prepare();

  const locator = eventLocator(page, namePattern);
  try {
    // Midnight blocks sit at the top of the week grid — ensure they are scrolled into view.
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await expect(locator).toBeVisible({ timeout: 20_000 });
    return;
  } catch {
    // Fall through to hard recovery below.
  }

  await clearScheduleViewState(page);
  await page.reload();
  await prepare();
  await eventLocator(page, namePattern).scrollIntoViewIfNeeded().catch(() => {});
  await expect(eventLocator(page, namePattern)).toBeVisible({ timeout: 25_000 });
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
