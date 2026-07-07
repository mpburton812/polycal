import { type Page, expect } from "@playwright/test";

import { fillProposalDateField } from "./datePickers";
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
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, SCHEDULE_VIEW_STORAGE_KEY);
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
  await dialog.getByRole("checkbox", { name: /All-day event/i }).check();
  await fillProposalDateField(dialog.getByLabel(/^Day$/i).first(), options.startDate);
  await fillProposalDateField(dialog.getByLabel(/End day/i).first(), options.endDate);
  await dialog.getByRole("button", { name: "Save" }).click();
  await submitProposalDraft(page, dialog);
}
