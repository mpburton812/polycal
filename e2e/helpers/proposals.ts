import { type Locator, type Page, expect } from "@playwright/test";

import { fillProposalDateField, fillProposalDateTimeField } from "./datePickers";
import { selectProposalTab } from "./navigation";

/** Locates a proposal Kanban card by exact title heading. */
export function proposalCard(page: Page, title: string) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { name: title, level: 2 }),
  });
}

/** Locates cards whose titles start with the given prefix (batch sleeping nights). */
export function proposalCardsWithPrefix(page: Page, titlePrefix: string) {
  const escaped = titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { level: 2, name: new RegExp(`^${escaped}`) }),
  });
}

/** Cycles an invitee chip to required (none → required). */
export async function setInviteeRequired(dialog: Locator, displayName: string) {
  const chip = dialog.getByRole("button", { name: new RegExp(displayName, "i") });
  await chip.click();
  await expect(chip).toHaveText(new RegExp(`${displayName} \\(required\\)`, "i"));
}

/** Cycles an invitee chip to optional (none → required → optional). */
export async function setInviteeOptional(dialog: Locator, displayName: string) {
  const chip = dialog.getByRole("button", { name: new RegExp(displayName, "i") });
  await chip.click();
  await chip.click();
  await expect(chip).toHaveText(new RegExp(`${displayName} \\(optional\\)`, "i"));
}

/** Marks every visible invitee chip as required. */
export async function setAllInviteesRequired(dialog: Locator): Promise<void> {
  const toggleButtons = dialog.locator("button.MuiToggleButton-root");
  const count = await toggleButtons.count();
  for (let index = 0; index < count; index += 1) {
    const chip = toggleButtons.nth(index);
    const text = (await chip.innerText()).trim();
    if (!text || /solo event|with invitees|intentional solo/i.test(text)) {
      continue;
    }
    let attempts = 0;
    while (!(await chip.innerText()).includes("(required)") && attempts < 3) {
      await chip.click();
      attempts += 1;
    }
    await expect(chip).toHaveText(/\(required\)/i);
  }
}

/** Selects Sleeping or Event type on a new proposal draft. */
export async function selectProposalType(page: Page, dialog: Locator, type: "Event" | "Sleeping") {
  await dialog.getByLabel("Type").click();
  await page.getByRole("option", { name: type }).click();
}

/** Submits a draft, confirming through schedule-conflict dialog when present. */
export async function submitProposalDraft(page: Page, dialog: Locator) {
  await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible({ timeout: 15_000 });
  await dialog.getByRole("button", { name: "Submit" }).click();

  const conflictDialog = page.getByRole("dialog", { name: "Schedule conflicts detected" });
  const hasConflict = await conflictDialog
    .waitFor({ state: "visible", timeout: 12_000 })
    .then(() => true)
    .catch(() => false);

  if (hasConflict) {
    const submitAnyway = conflictDialog.getByRole("button", { name: "Submit anyway" });
    await expect(submitAnyway).toBeEnabled({ timeout: 15_000 });
    await submitAnyway.click();
    await expect(conflictDialog).toBeHidden({ timeout: 25_000 });
  }

  await expect(dialog).toBeHidden({ timeout: 25_000 });
}

/** Creates and submits an event proposal with required + optional invitees. */
export async function createAndSubmitEvent(
  page: Page,
  options: {
    title: string;
    description?: string;
    requiredName: string;
    optionalName: string;
    start: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: "New proposal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(options.title);
  if (options.description) {
    await dialog.getByLabel(/Description/i).fill(options.description);
  }
  await setInviteeRequired(dialog, options.requiredName);
  await setInviteeOptional(dialog, options.optionalName);
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a solo event that auto-resolves (open privacy). */
export async function createAndSubmitSoloEvent(
  page: Page,
  options: {
    title: string;
    notes?: string;
    start: string;
    end: string;
  },
): Promise<void> {
  await page.getByRole("button", { name: "New proposal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  if (options.notes) {
    await dialog.getByLabel(/Notes/i).fill(options.notes);
  }
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a weekly recurring event inviting every visible invitee. */
export async function createAndSubmitRecurringEventForEveryone(
  page: Page,
  options: {
    title: string;
    start: string;
    end: string;
    occurrenceCount?: number;
  },
): Promise<void> {
  await page.getByRole("button", { name: "New proposal" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("checkbox", { name: /Recurring series/i }).check();
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await setAllInviteesRequired(dialog);
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await submitProposalDraft(page, dialog);
}

/**
 * Creates a batch week of intentional-solo sleeping drafts and submits each to resolved.
 */
export async function createAndSubmitSoloSleepingWeek(
  page: Page,
  options: {
    titlePrefix: string;
    rangeStart: string;
    rangeEnd: string;
  },
): Promise<number> {
  await page.getByRole("button", { name: "New proposal" }).click();
  const dialog = page.getByRole("dialog");
  await selectProposalType(page, dialog, "Sleeping");
  await dialog.getByRole("button", { name: "Intentional solo" }).click();
  await dialog.getByRole("checkbox", { name: /Batch \/ recurring nights/i }).check();
  await dialog.getByLabel("Title").fill(options.titlePrefix);
  await fillProposalDateField(dialog.getByLabel("Range start"), options.rangeStart);
  await fillProposalDateField(dialog.getByLabel("Range end"), options.rangeEnd);
  await dialog.getByRole("button", { name: "Create draft" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  await selectProposalTab(page, "Drafts");
  const total = await proposalCardsWithPrefix(page, options.titlePrefix).count();
  const escaped = options.titlePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (let i = 0; i < total; i += 1) {
    await selectProposalTab(page, "Drafts");
    const continueBtn = proposalCardsWithPrefix(page, options.titlePrefix)
      .first()
      .getByRole("button", { name: "Continue Editing" });
    await expect(continueBtn).toBeVisible({ timeout: 15_000 });
    await continueBtn.click();

    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByRole("heading", { name: "Edit draft" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(editDialog.getByLabel("Title")).toHaveValue(new RegExp(`^${escaped}`), {
      timeout: 20_000,
    });
    await submitProposalDraft(page, editDialog);
  }

  return total;
}
