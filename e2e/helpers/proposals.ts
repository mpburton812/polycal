import { type Locator, type Page, expect } from "@playwright/test";

import { fillProposalDateField, fillProposalDateTimeField } from "./datePickers";
import { openProposalCard, selectProposalTab } from "./navigation";

/** Locates a proposal Kanban card by exact title heading. */
export function proposalCard(page: Page, title: string | RegExp) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { name: title, level: 2 }),
  });
}

/** Escapes a string for use inside a RegExp. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Locates cards whose titles start with the given prefix (events, recurring series). */
export function proposalCardsWithPrefix(page: Page, titlePrefix: string) {
  const escaped = escapeRegex(titlePrefix);
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { level: 2, name: new RegExp(`^${escaped}`) }),
  });
}

/** Locates all auto-titled sleeping proposal cards (PC-66). */
export function sleepingProposalCards(page: Page) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { level: 2, name: /Sleeping:/ }),
  });
}

/** Locates a sleeping card by proposer and optional invitee display names. */
export function sleepingProposalCardsFor(
  page: Page,
  proposerName: string,
  options?: { inviteeName?: string },
) {
  const parts = [escapeRegex(proposerName)];
  if (options?.inviteeName) {
    parts.push(escapeRegex(options.inviteeName));
  }
  return proposalCard(page, new RegExp(`Sleeping:.*${parts.join(".*")}`, "i"));
}

/** Opens the FAB menu for creating proposals. */
export async function openNewProposalFabMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "New proposal" }).click();
}

/** Opens the event proposal draft dialog from the FAB menu. */
export async function openEventProposalDraft(page: Page): Promise<Locator> {
  await openNewProposalFabMenu(page);
  await page.getByRole("menuitem", { name: "Event proposal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New proposal" })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

/** Opens the sleeping proposal draft dialog from the FAB menu. */
export async function openSleepingProposalDraft(page: Page): Promise<Locator> {
  await openNewProposalFabMenu(page);
  await page.getByRole("menuitem", { name: "Sleeping proposal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New proposal" })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

/** @deprecated Use openEventProposalDraft or openSleepingProposalDraft */
export async function openEventOrSleepingProposalDraft(page: Page): Promise<Locator> {
  return openEventProposalDraft(page);
}

/** Opens the sleeping partner proposal dialog from the FAB menu. */
export async function openSleepingPartnerProposal(page: Page): Promise<Locator> {
  await openNewProposalFabMenu(page);
  await page.getByRole("menuitem", { name: /Sleeping partner proposal/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Sleeping Partner Proposal" })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

/** Builds inclusive YYYY-MM-DD dates from start through end. */
function inclusiveNightDates(rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${rangeStart}T00:00:00`);
  const end = new Date(`${rangeEnd}T00:00:00`);
  while (cursor <= end) {
    const pad = (value: number) => String(value).padStart(2, "0");
    dates.push(
      `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
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
    if (!text || /solo event|with invitees|solo/i.test(text)) {
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

/** Persists a proposal draft via the Save button (PC-70 label). */
export async function saveProposalDraft(dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
}

/** Closes the draft dialog via Exit (PC-70 label). */
export async function exitDraftDialog(dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: "Exit" }).click();
  await expect(dialog).toBeHidden();
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
  const dialog = await openEventOrSleepingProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  if (options.description) {
    await dialog.getByLabel(/Description/i).fill(options.description);
  }
  await setInviteeRequired(dialog, options.requiredName);
  await setInviteeOptional(dialog, options.optionalName);
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await dialog.getByRole("button", { name: "Save" }).click();
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
  const dialog = await openEventOrSleepingProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  if (options.notes) {
    await dialog.getByLabel(/Notes/i).fill(options.notes);
  }
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save" }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a solo event with a pre-event reminder offset. */
export async function createAndSubmitSoloEventWithReminder(
  page: Page,
  options: {
    title: string;
    start: string;
    end: string;
    reminderAmount: number;
    reminderUnit: "days" | "hours" | "minutes";
  },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  await dialog.getByRole("checkbox", { name: "Reminder before event" }).check();
  await dialog.getByLabel("Amount").fill(String(options.reminderAmount));
  await dialog.getByLabel("Unit").click();
  await page
    .getByRole("option", {
      name:
        options.reminderUnit === "days"
          ? "Days"
          : options.reminderUnit === "hours"
            ? "Hours"
            : "Minutes",
    })
    .click();
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save" }).click();
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
  const dialog = await openEventOrSleepingProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("checkbox", { name: /Recurring series/i }).check();
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await setAllInviteesRequired(dialog);
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save" }).click();
  await submitProposalDraft(page, dialog);
}

/**
 * Creates a batch week of solo sleeping nights in one proposal and submits it to resolved.
 * Returns the number of nights added to the batch.
 */
export async function createAndSubmitSoloSleepingWeek(
  page: Page,
  options: {
    titlePrefix?: string;
    rangeStart: string;
    rangeEnd: string;
  },
): Promise<number> {
  const nightDates = inclusiveNightDates(options.rangeStart, options.rangeEnd);
  const dialog = await openSleepingProposalDraft(page);
  await dialog
    .getByRole("checkbox", { name: "Batch (multiple nights in one proposal)" })
    .check();

  for (let index = 0; index < nightDates.length; index += 1) {
    if (index > 0) {
      await dialog.getByRole("button", { name: "Add night" }).click();
    }
    await fillProposalDateField(dialog.getByLabel("Night of").nth(index), nightDates[index]!);
    await dialog.getByRole("button", { name: "Solo", exact: true }).nth(index).click();
  }

  await submitProposalDraft(page, dialog);

  return nightDates.length;
}

/** Opens a special draft (group rename, residency) via detail dialog Edit. */
export async function openSpecialDraftForEdit(page: Page, title: string): Promise<Locator> {
  await openProposalCard(page, title);
  const detailDialog = page.getByRole("dialog");
  await detailDialog.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByRole("heading", { name: /Edit draft/i })).toBeVisible({
    timeout: 15_000,
  });
  return editDialog;
}

/** Opens a draft card in the edit dialog via Continue Editing. */
export async function openDraftForEdit(page: Page, title: string | RegExp): Promise<Locator> {
  const card = proposalCard(page, title);
  await card.getByRole("button", { name: "Continue Editing" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Edit draft/i })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}
export async function castPollSlotVote(
  dialog: Locator,
  slotRowIndex: number,
  voteLabel: "Accept" | "Sub-opt" | "Decline",
): Promise<void> {
  const row = dialog.locator("table").first().locator("tbody tr").nth(slotRowIndex);
  await row.getByRole("button", { name: new RegExp(`${voteLabel} for`, "i") }).click();
}

/** Creates and submits a time poll with the given slot start times and required invitees. */
export async function createAndSubmitPoll(
  page: Page,
  options: {
    title: string;
    description?: string;
    requiredNames: string[];
    slotStarts: string[];
    slotLabels?: string[];
  },
): Promise<void> {
  const dialog = await openEventOrSleepingProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  if (options.description) {
    await dialog.getByLabel(/Description/i).fill(options.description);
  }
  await dialog.getByRole("checkbox", { name: /Time poll/i }).check();
  for (const name of options.requiredNames) {
    await setInviteeRequired(dialog, name);
  }
  for (let index = 0; index < options.slotStarts.length; index += 1) {
    if (index > 0) {
      await dialog.getByRole("button", { name: "Add poll option" }).click();
    }
    if (options.slotLabels?.[index]) {
      await dialog.getByLabel(`Option ${index + 1} label`).fill(options.slotLabels[index]!);
    }
    await fillProposalDateTimeField(
      dialog.getByLabel("Start").nth(index),
      options.slotStarts[index]!,
    );
  }
  await submitProposalDraft(page, dialog);
}

/** Locates the bordered night editor block inside a batch sleeping draft dialog. */
export function batchNightSection(dialog: Locator, nightIndex: number): Locator {
  return dialog
    .getByText(`Night ${nightIndex + 1}`, { exact: true })
    .locator("xpath=ancestor::div[contains(@class,'MuiBox-root')][1]");
}

export type BatchNightConfig = {
  nightDate: string;
  mode: "solo" | "withInvitees";
  requiredInvitees?: string[];
  locationName?: string;
  /** Free-text location when the place is not in the solo-night dropdown (PC-69). */
  customLocation?: string;
  comment?: string;
};

/**
 * Configures one batch sleeping night row (date, solo/invitees, location, comment).
 * Uses nth-index fields and night-section scoping for invitee chips (PC-69).
 */
export async function configureBatchNight(
  dialog: Locator,
  page: Page,
  nightIndex: number,
  config: BatchNightConfig,
): Promise<void> {
  const section = batchNightSection(dialog, nightIndex);

  await fillProposalDateField(section.getByLabel("Night of"), config.nightDate);

  if (config.mode === "solo") {
    await section.getByRole("button", { name: "Solo", exact: true }).click();
  } else {
    await section.getByRole("button", { name: "With invitees" }).click();
    for (const displayName of config.requiredInvitees ?? []) {
      const chip = section.getByRole("button", { name: new RegExp(displayName, "i") });
      await chip.click();
      await expect(chip).toHaveText(new RegExp(`${displayName} \\(required\\)`, "i"));
    }
  }

  if (config.customLocation) {
    const locationSelect = section.getByRole("combobox", { name: "Location (optional)" });
    await locationSelect.click();
    await page.getByRole("option", { name: "None" }).click();
    await section.getByLabel("Custom location (optional)").fill(config.customLocation);
  } else if (config.locationName) {
    const locationSelect = section.getByRole("combobox", { name: "Location (optional)" });
    await expect(async () => {
      await locationSelect.click();
      const option = page.getByRole("option", { name: config.locationName });
      await expect(option).toBeVisible({ timeout: 2_000 });
      await option.click();
    }).toPass({ timeout: 20_000 });
  }

  if (config.comment) {
    await section.getByLabel("Comment (optional)").fill(config.comment);
  }
}

/** Opens a proposed card and accepts with an optional comment (partnership or event). */
export async function acceptProposalWithComment(page: Page, comment: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  const optionalComment = dialog.getByPlaceholder("Add a comment (optional)…");
  const threadComment = dialog.getByPlaceholder("Add a comment…");

  if (await optionalComment.isVisible().catch(() => false)) {
    await optionalComment.fill(comment);
  } else if (await threadComment.isVisible().catch(() => false)) {
    await threadComment.fill(comment);
    await dialog.getByRole("button", { name: "Post" }).click();
    await expect(dialog.getByText(comment)).toBeVisible({ timeout: 15_000 });
  }

  await dialog.getByRole("button", { name: "Accept" }).click();

  await dialog
    .getByText("RESOLVED", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .catch(() => {});

  const closeButton = dialog.getByRole("button", { name: "Close" });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }

  await expect(dialog).toBeHidden({ timeout: 25_000 });
}

/** Creates and submits a batch sleeping night with a required partner invitee. */
export async function createAndSubmitBatchSleepingWithInvitee(
  page: Page,
  options: {
    title?: string;
    nightDate: string;
    requiredPartnerName: string;
    locationName?: string;
    comment?: string;
  },
): Promise<void> {
  const dialog = await openSleepingProposalDraft(page);
  await dialog.getByRole("checkbox", { name: /Batch/i }).check();
  await fillProposalDateField(dialog.getByLabel("Night of").first(), options.nightDate);
  await dialog.getByRole("button", { name: "With invitees" }).first().click();
  await setInviteeRequired(dialog, options.requiredPartnerName);
  if (options.locationName) {
    await dialog.getByLabel("Location (optional)").first().click();
    await page.getByRole("option", { name: options.locationName }).click();
  }
  if (options.comment) {
    await dialog.getByLabel("Comment (optional)").first().fill(options.comment);
  }
  await submitProposalDraft(page, dialog);
}
