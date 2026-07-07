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

function daysUntil(isoDate: string): number {
  const target = new Date(`${isoDate}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function eventLocator(page: Page, namePattern: RegExp) {
  return page
    .getByRole("button", { name: namePattern })
    .or(page.getByTitle(namePattern))
    .first();
}

/**
 * Advances the week calendar toward `targetDateIso` and waits for a matching block.
 * Stays in week view so sleeping aria-labels remain discoverable.
 */
export async function advanceScheduleUntilEventVisible(
  page: Page,
  namePattern: RegExp,
  options?: { targetDateIso?: string },
): Promise<void> {
  await goToSchedule(page);

  if (options?.targetDateIso) {
    const weeksAhead = Math.max(0, Math.ceil(daysUntil(options.targetDateIso) / 7));
    for (let step = 0; step < weeksAhead + 1; step += 1) {
      const block = eventLocator(page, namePattern);
      if (await block.isVisible().catch(() => false)) break;
      const next = page.getByRole("button", { name: "Next period" });
      await expect(next).toBeEnabled({ timeout: 15_000 });
      await next.click();
    }
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
