import { type Page, expect } from "@playwright/test";

import { fillProposalDateField } from "./datePickers";
import { goToSchedule } from "./navigation";
import { openEventProposalDraft, submitProposalDraft } from "./proposals";

/** ISO yyyy-MM-dd offset from today. */
export function dateOffsetIso(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function readMonthAnchor(page: Page): Promise<Date> {
  const header = page.locator("main p").filter({ hasText: /^\w+ \d{4}$/ }).first();
  await expect(header).toBeVisible({ timeout: 10_000 });
  const text = (await header.textContent())?.trim() ?? "";
  const parsed = new Date(`${text} 1`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Could not parse schedule month header: ${text}`);
  }
  return parsed;
}

/** Moves the month calendar until it includes `targetDateIso` (yyyy-MM-dd). */
export async function navigateScheduleToMonth(
  page: Page,
  targetDateIso: string,
): Promise<void> {
  await goToSchedule(page);
  await page.getByRole("button", { name: "Month", exact: true }).click();

  const target = new Date(`${targetDateIso}T12:00:00`);
  const targetKey = target.getFullYear() * 12 + target.getMonth();

  for (let step = 0; step < 36; step += 1) {
    const anchor = await readMonthAnchor(page);
    const anchorKey = anchor.getFullYear() * 12 + anchor.getMonth();
    if (anchorKey === targetKey) return;

    const next = page.getByRole("button", { name: "Next period" });
    const prev = page.getByRole("button", { name: "Previous period" });
    if (anchorKey < targetKey) {
      await expect(next).toBeEnabled({ timeout: 15_000 });
      await next.click();
    } else {
      await expect(prev).toBeEnabled({ timeout: 15_000 });
      await prev.click();
    }
  }

  const anchor = await readMonthAnchor(page);
  const anchorKey = anchor.getFullYear() * 12 + anchor.getMonth();
  expect(anchorKey).toBe(target.getFullYear() * 12 + target.getMonth());
}

/**
 * Opens month view on the target month and waits for a matching calendar block.
 * Week-view aria-labels include sleeping titles; month chips use visible text.
 */
export async function advanceScheduleUntilEventVisible(
  page: Page,
  namePattern: RegExp,
  options?: { targetDateIso?: string },
): Promise<void> {
  if (options?.targetDateIso) {
    await navigateScheduleToMonth(page, options.targetDateIso);
  } else {
    await goToSchedule(page);
    await page.getByRole("button", { name: "Month", exact: true }).click();
  }

  await expect(page.getByRole("button", { name: namePattern }).first()).toBeVisible({
    timeout: 20_000,
  });
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
