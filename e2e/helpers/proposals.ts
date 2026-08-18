import { type Locator, type Page, expect } from "@playwright/test";

import { fillProposalDateTimeField, fillProposalDateRange, selectDraftScheduleMode } from "./datePickers";
import { goToProposals, openProposalCard, selectProposalTab } from "./navigation";
import { expectToast } from "./toast";

/** Locates a proposal Kanban card by exact title heading. */
export function proposalCard(page: Page, title: string | RegExp) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", {
      name: title,
      level: 2,
      // String titles must not substring-match recurring children (`Title — Tue, Sep 8`).
      exact: typeof title === "string",
    }),
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

/** Opens the New Event composer without locking Social or Sleeping (PC-429). */
export async function openNewEventComposer(page: Page): Promise<Locator> {
  await openNewProposalFabMenu(page);
  await page.getByRole("menuitem", { name: "New Event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New Event", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

/** Opens the Description-first NLP composer (PC-439). */
export async function openNlpEventComposer(page: Page): Promise<Locator> {
  await openNewProposalFabMenu(page);
  await page.getByRole("menuitem", { name: "New Event (NLP Input)", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "New Event (NLP Input)", exact: true }),
  ).toBeVisible({
    timeout: 15_000,
  });
  return dialog;
}

/** Opens the event proposal draft dialog from the FAB menu. */
export async function openEventProposalDraft(page: Page): Promise<Locator> {
  const dialog = await openNewEventComposer(page);
  await dialog.getByRole("button", { name: "Social", exact: true }).click();
  return dialog;
}

/** Opens the sleeping proposal draft dialog from the FAB menu. */
export async function openSleepingProposalDraft(page: Page): Promise<Locator> {
  await openNewProposalFabMenu(page);
  await page.getByRole("menuitem", { name: "New Event", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New Event", exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByRole("button", { name: "Sleeping", exact: true }).click();
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

/**
 * Who chips appear after Social (and posting kind in dual mode). Empty Who is Solo (PC-435).
 */
async function revealInviteeRoster(dialog: Locator): Promise<void> {
  const social = dialog.getByRole("button", { name: "Social", exact: true });
  const sleeping = dialog.getByRole("button", { name: "Sleeping", exact: true });
  const sleepingOn = (await sleeping.getAttribute("aria-pressed")) === "true";
  const socialOn = (await social.getAttribute("aria-pressed")) === "true";
  if (!sleepingOn && !socialOn && (await social.count()) > 0) {
    await social.click();
  }

  const proposalBtn = dialog.getByRole("button", { name: "Proposal", exact: true });
  const bookingBtn = dialog.getByRole("button", { name: "Booking", exact: true });
  if (await proposalBtn.isVisible().catch(() => false)) {
    const bookingOn = (await bookingBtn.getAttribute("aria-pressed")) === "true";
    const proposalOn = (await proposalBtn.getAttribute("aria-pressed")) === "true";
    if (!bookingOn && !proposalOn) {
      await proposalBtn.click();
    }
  }

  if (!(await dialog.getByText("Who:", { exact: true }).isVisible().catch(() => false))) {
    const startField = dialog.getByTestId("date-range-start").first();
    if (await startField.isVisible().catch(() => false)) {
      await fillProposalDateRange(dialog, "2099-10-01");
    }
  }

  await expect(dialog.getByText("Who:", { exact: true })).toBeVisible({ timeout: 15_000 });
}

function whoChip(dialog: Locator, displayName: string) {
  return dialog.getByRole("button", {
    name: new RegExp(
      `^${escapeRegex(displayName)} (not selected|required|optional|booked)$`,
      "i",
    ),
  });
}

async function cycleWhoChipTo(
  dialog: Locator,
  displayName: string,
  role: "required" | "optional" | "booked",
): Promise<void> {
  await revealInviteeRoster(dialog);
  const button = whoChip(dialog, displayName);
  await expect(button).toBeVisible({ timeout: 15_000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const label = ((await button.getAttribute("aria-label")) ?? "").toLowerCase();
    if (label.endsWith(` ${role}`)) {
      await expect(button).toHaveAttribute("aria-pressed", "true");
      return;
    }
    await button.click();
  }
  throw new Error(`Could not set ${displayName} to ${role}`);
}

/** Cycles a Who chip to required (none → required). */
export async function setInviteeRequired(dialog: Locator, displayName: string) {
  await cycleWhoChipTo(dialog, displayName, "required");
}

/** Cycles a Who chip to optional (none → required → optional). */
export async function setInviteeOptional(dialog: Locator, displayName: string) {
  await cycleWhoChipTo(dialog, displayName, "optional");
}

/** Marks every visible person as a required invitee via Who chips (PC-126 / PC-435). */
export async function setAllInviteesRequired(dialog: Locator): Promise<void> {
  await revealInviteeRoster(dialog);
  const chips = dialog.getByRole("button", {
    name: / (not selected|required|optional|booked)$/i,
  });
  await expect(chips.first()).toBeVisible({ timeout: 15_000 });
  const count = await chips.count();
  for (let index = 0; index < count; index += 1) {
    const button = chips.nth(index);
    const inIconPicker = await button.evaluate((el) =>
      Boolean(el.closest('[data-testid="event-icon-picker"]')),
    );
    if (inIconPicker) continue;
    const name = ((await button.getAttribute("aria-label")) ?? "").replace(
      / (not selected|required|optional|booked)$/i,
      "",
    );
    if (name) {
      await cycleWhoChipTo(dialog, name, "required");
    }
  }
}

/** Expands the draft dialog More options accordion when collapsed (PC-126). */
export async function expandDraftMoreOptions(dialog: Locator): Promise<void> {
  if (!(await dialog.getByRole("button", { name: /More options/i }).isVisible().catch(() => false))) {
    await revealInviteeRoster(dialog);
  }
  const summary = dialog.getByRole("button", { name: /More options/i });
  await expect(summary).toBeVisible();
  const expanded = await summary.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await summary.click();
  }
  await expect(dialog.getByLabel(/Details/i)).toBeVisible();
}

/** Selects Sleeping or Social type on a new event draft. */
export async function selectProposalType(page: Page, dialog: Locator, type: "Event" | "Sleeping") {
  await dialog.getByRole("button", { name: type === "Event" ? "Social" : "Sleeping", exact: true }).click();
}

/** @deprecated New Event drafts persist only via Submit / Add to calendar (PC-429). */
export async function saveProposalDraft(dialog: Locator): Promise<void> {
  await expect(dialog.getByRole("button", { name: /^(Submit|Add to calendar)$/ })).toBeVisible();
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
  await expect(primary).toBeEnabled({ timeout: 15_000 });
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await setInviteeRequired(dialog, options.requiredName);
  await setInviteeOptional(dialog, options.optionalName);
  if (options.description) {
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.description);
  }
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  if (options.notes) {
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Notes/i).fill(options.notes);
  }
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await selectDraftScheduleMode(dialog, "Recurring");
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await setAllInviteesRequired(dialog);
  await submitProposalDraft(page, dialog);
}

/**
 * Creates a batch of solo sleeping nights via Bulk Sleep Booking (auto-confirms).
 * Nights must fall within the shared 14-day fast plan grid (today+13).
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
  await openNewProposalFabMenu(page);
  await page.getByTestId("fab-fast-sleep").click();
  const dialog = page.getByTestId("fast-sleep-dialog");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible({ timeout: 15_000 });

  for (const nightDate of nightDates) {
    await configureBatchNight(dialog, page, nightDate, {
      nightDate,
      mode: "solo",
    });
  }

  await dialog.getByTestId("fast-sleep-submit").click();
  if (await dialog.getByText(/Submit again/i).isVisible().catch(() => false)) {
    await dialog.getByTestId("fast-sleep-submit").click();
  }
  await expect(dialog).toBeHidden({ timeout: 30_000 });

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
  if (options.description) {
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.description);
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

/**
 * Clicks the comment-thread Post control.
 * Anchored name is required: `exact: true` still substring-matches "Post to Feed" (PC-431).
 */
export async function clickCommentPost(dialog: Locator): Promise<void> {
  await dialog.getByRole("button", { name: /^Post$/ }).click();
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
    await clickCommentPost(dialog);
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.comment);
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
  await selectDraftScheduleMode(dialog, "All Day");
  await fillProposalDateRange(dialog, options.day);
  await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.comment);
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  await selectDraftScheduleMode(dialog, "Recurring");
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.comment);
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
  await selectDraftScheduleMode(dialog, "All Day");
  const day = options.day.slice(0, 10);
  await fillProposalDateRange(dialog, day, day);
  await selectDraftScheduleMode(dialog, "Recurring");
  await dialog.getByLabel("Occurrences").fill(String(options.occurrenceCount ?? 4));
  await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.comment);
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
  await fillProposalDateTimeField(dialog.getByLabel("Start").first(), options.start);
  await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), options.end);
  if (options.inviteeRole === "required") {
    await setInviteeRequired(dialog, options.inviteeName);
  } else {
    await setInviteeOptional(dialog, options.inviteeName);
  }
  await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.comment);
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

/** Creates and submits a sleeping night with a required partner invitee. */
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
  await dialog.getByLabel("Title").fill(options.title ?? `E2E sleeping ${Date.now()}`);
  await fillProposalDateRange(dialog, options.nightDate, options.nightDate);
  await setInviteeRequired(dialog, options.requiredPartnerName);
  if (options.locationName) {
    await dialog.getByRole("button", { name: options.locationName, exact: true }).click();
  }
  if (options.comment) {
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill(options.comment);
  }
  await submitProposalDraft(page, dialog);
}
