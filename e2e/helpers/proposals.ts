import { type Locator, type Page, expect } from "@playwright/test";

import { fillProposalDateTimeField, fillProposalDateRange, selectDraftScheduleMode } from "./datePickers";
import { goToProposals, openProposalCard, selectProposalTab } from "./navigation";
import { expectToast } from "./toast";

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
  const fab = page.getByRole("button", { name: "New proposal" });
  await expect(fab).toBeVisible({ timeout: 15_000 });
  await fab.click();
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

/** Builds inclusive YYYY-MM-DD dates from start through end (civil arithmetic). */
function inclusiveNightDates(rangeStart: string, rangeEnd: string): string[] {
  const dates: string[] = [];
  const startParts = rangeStart.split("-").map(Number);
  const endParts = rangeEnd.split("-").map(Number);
  if (startParts.length !== 3 || endParts.length !== 3) return dates;
  const [sy, sm, sd] = startParts as [number, number, number];
  const [ey, em, ed] = endParts as [number, number, number];
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const pad = (value: number) => String(value).padStart(2, "0");
  while (cursor.getTime() <= end.getTime()) {
    dates.push(
      `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`,
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Cycles an invitee chip to required (none → required). */
export async function setInviteeRequired(dialog: Locator, displayName: string) {
  const withInvitees = dialog.getByRole("button", { name: "With invitees", exact: true });
  if (
    (await withInvitees.count()) > 0 &&
    (await withInvitees.getAttribute("aria-pressed")) !== "true"
  ) {
    await withInvitees.click();
  }
  const button = dialog.getByRole("button", {
    name: new RegExp(`^${escapeRegex(displayName)} required$`, "i"),
  });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** Selects optional invitee role via explicit Optional control (PC-126). */
export async function setInviteeOptional(dialog: Locator, displayName: string) {
  const withInvitees = dialog.getByRole("button", { name: "With invitees", exact: true });
  if (
    (await withInvitees.count()) > 0 &&
    (await withInvitees.getAttribute("aria-pressed")) !== "true"
  ) {
    await withInvitees.click();
  }
  const button = dialog.getByRole("button", {
    name: new RegExp(`^${escapeRegex(displayName)} optional$`, "i"),
  });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** Marks every visible person as a required invitee via Required toggles (PC-126). */
export async function setAllInviteesRequired(dialog: Locator): Promise<void> {
  const requiredButtons = dialog.getByRole("button", { name: / required$/i });
  const count = await requiredButtons.count();
  for (let index = 0; index < count; index += 1) {
    const button = requiredButtons.nth(index);
    const inIconPicker = await button.evaluate((el) =>
      Boolean(el.closest('[data-testid="event-icon-picker"]')),
    );
    if (inIconPicker) continue;
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
}

/** Expands the draft dialog More options accordion when collapsed (PC-126). */
export async function expandDraftMoreOptions(dialog: Locator): Promise<void> {
  const summary = dialog.getByRole("button", { name: /More options/i });
  await expect(summary).toBeVisible();
  const expanded = await summary.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await summary.click();
  }
  await expect(dialog.getByLabel(/Description/i)).toBeVisible();
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

/**
 * After Exit, reloads the Drafts board so a just-saved card is not missed during a
 * mid-flight router.refresh() (flake seen on production CI for Window drafts).
 */
export async function expectDraftCardAfterExit(
  page: Page,
  title: string | RegExp,
): Promise<void> {
  await goToProposals(page);
  await selectProposalTab(page, "Drafts");
  await expect(proposalCard(page, title)).toBeVisible({ timeout: 20_000 });
}

/** Selects an optional event category icon in the draft dialog (PC-116). */
export async function selectEventIcon(dialog: Locator, a11yLabel: string): Promise<void> {
  await expandDraftMoreOptions(dialog);
  await dialog.getByRole("button", { name: a11yLabel }).click();
}

/** Submits a draft, confirming through schedule-conflict dialog when present. */
export async function submitProposalDraft(page: Page, dialog: Locator) {
  const primary = dialog.getByRole("button", { name: /^(Submit|Add to calendar)$/ });
  await expect(primary).toBeVisible({ timeout: 15_000 });
  await primary.click();

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
    await expandDraftMoreOptions(dialog);
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
    await expandDraftMoreOptions(dialog);
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
  await expandDraftMoreOptions(dialog);
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
  await selectDraftScheduleMode(dialog, "Recurring");
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await setAllInviteesRequired(dialog);
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save" }).click();
  await submitProposalDraft(page, dialog);
}

/**
 * Creates a batch of solo sleeping nights in one proposal and submits it (normal approval;
 * solo auto-resolves). Nights must fall within the shared 14-day fast plan grid (today+13).
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
    .getByRole("checkbox", { name: /Batch nights/i })
    .check();

  await expect(dialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible({ timeout: 15_000 });

  for (const nightDate of nightDates) {
    await configureBatchNight(dialog, page, nightDate, {
      nightDate,
      mode: "solo",
    });
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

/** Creates and submits a time poll with the given slot start times and invitees. */
export async function createAndSubmitPoll(
  page: Page,
  options: {
    title: string;
    description?: string;
    requiredNames: string[];
    optionalNames?: string[];
    slotStarts: string[];
    slotLabels?: string[];
  },
): Promise<void> {
  const dialog = await openEventOrSleepingProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await selectDraftScheduleMode(dialog, "Poll");
  if (options.description) {
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Description/i).fill(options.description);
  }
  for (const name of options.requiredNames) {
    await setInviteeRequired(dialog, name);
  }
  for (const name of options.optionalNames ?? []) {
    await setInviteeOptional(dialog, name);
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

/** Casts the same Accept / Sub-opt / Decline vote on every poll matrix row. */
export async function castAllPollSlotVotes(
  dialog: Locator,
  voteLabel: "Accept" | "Sub-opt" | "Decline",
  page?: Page,
): Promise<void> {
  const rows = dialog.locator("table").first().locator("tbody tr");
  await expect(rows.first()).toBeVisible({ timeout: 20_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await castPollSlotVote(dialog, index, voteLabel);
    if (page) {
      await expectToast(page, /Slot vote recorded|Vote recorded/i).catch(() => {});
    }
  }
}

/** Locates one night block in the shared fast sleeping plan grid by ISO date. */
export function batchNightSection(dialog: Locator, nightDate: string): Locator {
  return dialog.getByTestId(`fast-sleep-night-${nightDate.slice(0, 10)}`);
}

export type BatchNightConfig = {
  nightDate: string;
  mode: "solo" | "withInvitees";
  requiredInvitees?: string[];
  optionalInvitees?: string[];
  locationName?: string;
  /** Free-text location when the place is not in the solo-night dropdown (PC-69). */
  customLocation?: string;
  comment?: string;
};

/**
 * Configures one night in the shared fast sleeping plan grid (PC-116).
 * `nightDate` must be within the visible today…+13 window.
 */
export async function configureBatchNight(
  dialog: Locator,
  page: Page,
  nightDateOrIndex: string | number,
  config: BatchNightConfig,
): Promise<void> {
  const nightDate =
    typeof nightDateOrIndex === "string" ? nightDateOrIndex.slice(0, 10) : config.nightDate.slice(0, 10);
  const section = batchNightSection(dialog, nightDate);
  await expect(section).toBeVisible({
    timeout: 10_000,
  });

  if (config.mode === "solo") {
    await section.getByRole("button", { name: "Solo", exact: true }).click();
  } else {
    await section.getByRole("button", { name: "Partners", exact: true }).click();
    for (const displayName of config.requiredInvitees ?? []) {
      const chip = section.getByRole("button", { name: displayName, exact: true });
      await chip.click();
      await expect(chip).toHaveClass(/MuiChip-colorPrimary|MuiChip-filled/);
      // Partners default to optional (PC-374) — mark required when the journey needs votes.
      await section.getByRole("button", { name: `${displayName} required` }).click();
    }
    for (const displayName of config.optionalInvitees ?? []) {
      const chip = section.getByRole("button", { name: displayName, exact: true });
      await chip.click();
      await expect(chip).toHaveClass(/MuiChip-colorPrimary|MuiChip-filled/);
      await section.getByRole("button", { name: `${displayName} optional` }).click();
    }
  }

  if (config.customLocation) {
    const locationSelect = section.getByRole("combobox", { name: "Place" });
    await locationSelect.click();
    await page.getByRole("option", { name: "None" }).click();
    await section.getByLabel("Custom location").fill(config.customLocation);
  } else if (config.locationName) {
    const locationSelect = section.getByRole("combobox", { name: "Place" });
    await expect(async () => {
      await locationSelect.click();
      const option = page.getByRole("option", { name: config.locationName });
      await expect(option).toBeVisible({ timeout: 2_000 });
      await option.click();
    }).toPass({ timeout: 20_000 });
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

  // Soft close: router.refresh after vote may unmount the dialog before Close is usable.
  const closeButton = dialog.getByRole("button", { name: "Close" });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }

  await expect(dialog).toBeHidden({ timeout: 25_000 });
}

/** Creates and submits a solo timed event with description comment. */
export async function createAndSubmitSoloTimedEvent(
  page: Page,
  options: {
    title: string;
    comment: string;
    start: string;
    end: string;
  },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  await expandDraftMoreOptions(dialog);
  await dialog.getByLabel(/Description/i).fill(options.comment);
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a solo single-day all-day event with description comment. */
export async function createAndSubmitSoloAllDayEvent(
  page: Page,
  options: {
    title: string;
    comment: string;
    day: string;
  },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  await selectDraftScheduleMode(dialog, "All Day");
  await expandDraftMoreOptions(dialog);
  await dialog.getByLabel(/Description/i).fill(options.comment);
  await fillProposalDateRange(dialog, options.day);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a solo weekly recurring timed event with description comment. */
export async function createAndSubmitSoloRecurringTimedEvent(
  page: Page,
  options: {
    title: string;
    comment: string;
    start: string;
    end: string;
    occurrenceCount?: number;
  },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  await selectDraftScheduleMode(dialog, "Recurring");
  await expandDraftMoreOptions(dialog);
  await dialog.getByLabel(/Description/i).fill(options.comment);
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a solo weekly recurring all-day event with description comment. */
export async function createAndSubmitSoloRecurringAllDayEvent(
  page: Page,
  options: {
    title: string;
    comment: string;
    day: string;
    occurrenceCount?: number;
  },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
  await selectDraftScheduleMode(dialog, "All Day");
  await selectDraftScheduleMode(dialog, "Recurring");
  await expandDraftMoreOptions(dialog);
  await dialog.getByLabel(/Description/i).fill(options.comment);
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  const day = options.day.slice(0, 10);
  await fillProposalDateRange(dialog, day, day);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, dialog);
}

/** Creates and submits a timed event with one invitee in the given role. */
export async function createAndSubmitTimedEventWithInvitee(
  page: Page,
  options: {
    title: string;
    comment: string;
    inviteeName: string;
    inviteeRole: "required" | "optional";
    start: string;
    end: string;
  },
): Promise<void> {
  const dialog = await openEventProposalDraft(page);
  await dialog.getByLabel("Title").fill(options.title);
  await expandDraftMoreOptions(dialog);
  await dialog.getByLabel(/Description/i).fill(options.comment);
  if (options.inviteeRole === "required") {
    await setInviteeRequired(dialog, options.inviteeName);
  } else {
    await setInviteeOptional(dialog, options.inviteeName);
  }
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, dialog);
}

/** Re-drafts a resolved event, shifts schedule fields, and resubmits. */
export async function moveResolvedEventByRedraft(
  page: Page,
  title: string,
  options: {
    start: string;
    end?: string;
    allDay?: boolean;
  },
): Promise<void> {
  await goToProposals(page);
  await selectProposalTab(page, "Resolved");
  await openProposalCard(page, title);
  const detailDialog = page.getByRole("dialog");
  page.once("dialog", (dialog) => dialog.accept());
  await detailDialog.getByRole("button", { name: "Re-draft" }).click();

  const draftDialog = page.getByRole("dialog");
  await expect(draftDialog.getByRole("heading", { name: /Edit draft/i })).toBeVisible({
    timeout: 15_000,
  });

  if (options.allDay) {
    const day = options.start.slice(0, 10);
    // Single-day all-day moves must keep end=start — clearing end drops the event off the calendar.
    await fillProposalDateRange(draftDialog, day, options.end?.slice(0, 10) ?? day);
  } else {
    await fillProposalDateTimeField(draftDialog.getByLabel("Start").first(), options.start);
    if (options.end) {
      await fillProposalDateTimeField(
        draftDialog.getByLabel("End (optional)").first(),
        options.end,
      );
    }
  }

  await draftDialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, draftDialog);
}

/** Updates schedule fields on an existing draft and resubmits. */
export async function moveDraftEventDates(
  page: Page,
  title: string,
  options: {
    start: string;
    end?: string;
    allDay?: boolean;
  },
): Promise<void> {
  await goToProposals(page);
  await selectProposalTab(page, "Drafts");
  const draftDialog = await openDraftForEdit(page, title);

  if (options.allDay) {
    await fillProposalDateRange(draftDialog, options.start.slice(0, 10), options.end?.slice(0, 10));
  } else {
    await fillProposalDateTimeField(draftDialog.getByLabel("Start").first(), options.start);
    if (options.end) {
      await fillProposalDateTimeField(
        draftDialog.getByLabel("End (optional)").first(),
        options.end,
      );
    }
  }

  await draftDialog.getByRole("button", { name: "Save", exact: true }).click();
  await submitProposalDraft(page, draftDialog);
}

/** Invitee casts Accept, Abstain, or Decline on a proposal card. */
export async function castInviteeVote(
  page: Page,
  options: {
    title: string;
    tab: "Proposed" | "Resolved";
    vote: "Accept" | "Abstain" | "Decline";
    comment?: string;
  },
): Promise<void> {
  await selectProposalTab(page, options.tab);
  await openProposalCard(page, options.title);
  const dialog = page.getByRole("dialog");

  if (options.comment) {
    const optionalComment = dialog.getByPlaceholder("Add a comment (optional)…");
    if (await optionalComment.isVisible().catch(() => false)) {
      await optionalComment.fill(options.comment);
    }
  }

  await dialog.getByRole("button", { name: options.vote, exact: true }).click();
  await expectToast(page, /Vote recorded/i);

  if (options.vote !== "Decline") {
    await expect(dialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  // Soft close: refresh after vote may already dismiss the dialog (PC-138).
  const closeButton = dialog.getByRole("button", { name: "Close" });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }
  await expect(dialog).toBeHidden({ timeout: 15_000 }).catch(() => {});
}

/** Waits until a proposal title appears on the Resolved tab. */
export async function expectResolvedProposal(page: Page, title: string): Promise<void> {
  await selectProposalTab(page, "Resolved");
  await expect(page.getByRole("heading", { name: title, level: 2 }).first()).toBeVisible({
    timeout: 20_000,
  });
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
  await expect(dialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible({ timeout: 15_000 });
  await configureBatchNight(dialog, page, options.nightDate, {
    nightDate: options.nightDate,
    mode: "withInvitees",
    requiredInvitees: [options.requiredPartnerName],
    locationName: options.locationName,
  });
  await submitProposalDraft(page, dialog);
}
