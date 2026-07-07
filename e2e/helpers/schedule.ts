import { type Page, expect } from "@playwright/test";

import { fillProposalDateField } from "./datePickers";
import { goToSchedule } from "./navigation";
import { openEventProposalDraft, submitProposalDraft } from "./proposals";

/** Advances the schedule until a calendar block matching `namePattern` is visible. */
export async function advanceScheduleUntilEventVisible(
  page: Page,
  namePattern: RegExp,
  maxSteps = 40,
): Promise<void> {
  await goToSchedule(page);
  for (let step = 0; step < maxSteps; step += 1) {
    const block = page.getByRole("button", { name: namePattern }).first();
    if (await block.isVisible().catch(() => false)) {
      return;
    }
    await page.getByRole("button", { name: "Next period" }).click();
  }
  await expect(page.getByRole("button", { name: namePattern }).first()).toBeVisible({
    timeout: 5_000,
  });
}

/** ISO yyyy-MM-dd offset from today. */
export function dateOffsetIso(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Creates and submits a resolved all-day event spanning multiple calendar days. */
export async function createAndSubmitAllDaySpan(
  page: Page,
  options: { title: string; startDate: string; endDate: string },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("checkbox", { name: /All-day event/i }).check();
  await fillProposalDateField(dialog.getByLabel(/^Day$/i).first(), options.startDate);
  await fillProposalDateField(dialog.getByLabel(/End day/i).first(), options.endDate);
  await dialog.getByRole("button", { name: "Save" }).click();
  await submitProposalDraft(page, dialog);
}
