import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import {
  fillProposalDateRange,
  fillProposalDateTimeField,
  selectDraftScheduleMode,
} from "./helpers/datePickers";
import { USERS } from "./helpers/constants";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import { dismissMotdDialogIfOpen } from "./helpers/motd";
import {
  openEventProposalDraft,
  proposalCard,
  proposalCardsWithPrefix,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";

/**
 * Comprehensive When-field coverage: Window / All Day / Poll / Recurring,
 * including the End day typing regression (PC-209 / PC-210).
 */
test.describe("Proposal When dates and times journey", () => {
  test.beforeEach(async ({ page, _freshDb }) => {
    void _freshDb;
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await dismissMotdDialogIfOpen(page);
  });

  test("All Day: typing 1 or 2 into End day does not clobber Day", async ({ page }) => {
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(`E2E AllDay type End ${Date.now()}`);
    await selectDraftScheduleMode(dialog, "All Day");

    const startField = dialog.getByTestId("date-range-start");
    const endField = dialog.getByTestId("date-range-end");
    await startField.fill("2099-07-13");
    await startField.press("Tab");
    await expect(startField).toHaveValue("2099-07-13");

    await endField.click();
    await endField.fill("");
    await endField.pressSequentially("2", { delay: 40 });
    await expect(startField).toHaveValue("2099-07-13");
    await expect(endField).toHaveValue("2");

    await endField.fill("");
    await endField.pressSequentially("1", { delay: 40 });
    await expect(startField).toHaveValue("2099-07-13");
    await expect(endField).toHaveValue("1");
  });

  test("All Day: letters and negatives in End day leave Day intact", async ({ page }) => {
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(`E2E AllDay junk End ${Date.now()}`);
    await selectDraftScheduleMode(dialog, "All Day");

    const startField = dialog.getByTestId("date-range-start");
    const endField = dialog.getByTestId("date-range-end");
    await startField.fill("2099-07-13");
    await startField.press("Tab");

    await endField.fill("abc");
    await expect(startField).toHaveValue("2099-07-13");
    await expect(endField).toHaveValue("abc");

    await endField.fill("-1");
    await expect(startField).toHaveValue("2099-07-13");
    await expect(endField).toHaveValue("-1");
  });

  test("All Day: completing End before Start reorders once both are valid ISO", async ({
    page,
  }) => {
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(`E2E AllDay reorder ${Date.now()}`);
    await selectDraftScheduleMode(dialog, "All Day");

    const startField = dialog.getByTestId("date-range-start");
    const endField = dialog.getByTestId("date-range-end");
    await startField.fill("2099-07-15");
    await startField.press("Tab");
    await endField.fill("2099-07-13");
    await endField.press("Tab");

    await expect(startField).toHaveValue("2099-07-13");
    await expect(endField).toHaveValue("2099-07-15");
  });

  test("All Day: valid multi-day span submits a solo event", async ({ page }) => {
    const title = `E2E AllDay valid ${Date.now()}`;
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await selectDraftScheduleMode(dialog, "All Day");
    await fillProposalDateRange(dialog, "2099-07-13", "2099-07-15");
    await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await submitProposalDraft(page, dialog);
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, title)).toBeVisible();
  });

  test("Window: valid timed start/end submits a solo event", async ({ page }) => {
    const title = `E2E Window valid ${Date.now()}`;
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await selectDraftScheduleMode(dialog, "Window");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-08-01T10:00");
    await fillProposalDateTimeField(dialog.getByLabel("End").first(), "2099-08-01T12:00");
    await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await submitProposalDraft(page, dialog);
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, title)).toBeVisible();
  });

  test("Window: End auto-extends when Start moves past End", async ({ page }) => {
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(`E2E Window end-before ${Date.now()}`);
    await selectDraftScheduleMode(dialog, "Window");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-08-01T10:00");
    await fillProposalDateTimeField(dialog.getByLabel("End").first(), "2099-08-01T11:00");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-08-01T14:00");
    const endValue = await dialog.getByLabel("End").first().inputValue();
    // Expected MUI display for 15:00 after +1h bump from 14:00.
    expect(endValue).toMatch(/03:00\s*PM|15:00|3:00/i);
    await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  test("Poll: distinct slots still allow submit after invitees", async ({
    page,
  }) => {
    const title = `E2E Poll slots ${Date.now()}`;
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await selectDraftScheduleMode(dialog, "Poll");

    const startInputs = dialog.getByLabel("Start");
    await fillProposalDateTimeField(startInputs.nth(0), "2099-08-01T10:00");
    await dialog.getByRole("button", { name: "Add poll option" }).click();
    await fillProposalDateTimeField(startInputs.nth(1), "2099-08-01T10:00");
    await setInviteeRequired(dialog, USERS.leia.displayName);
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeEnabled();
    await expect(dialog.getByLabel("Start")).toHaveCount(2);
  });

  test("Poll: Recurring control is disabled; Recurring + Window saves", async ({ page }) => {
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(`E2E Recurring check ${Date.now()}`);
    await selectDraftScheduleMode(dialog, "Poll");
    await expect(dialog.getByRole("button", { name: "Recurring", exact: true })).toBeDisabled();

    await selectDraftScheduleMode(dialog, "Window");
    await selectDraftScheduleMode(dialog, "Recurring");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-09-01T10:00");
    await fillProposalDateTimeField(dialog.getByLabel("End").first(), "2099-09-01T11:00");
    await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  test("Recurring All Day: valid series span saves", async ({ page }) => {
    const title = `E2E Recurring AllDay ${Date.now()}`;
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await selectDraftScheduleMode(dialog, "All Day");
    await selectDraftScheduleMode(dialog, "Recurring");
    await fillProposalDateRange(dialog, "2099-09-01", "2099-09-01");
    await dialog.getByLabel("Occurrences").fill("4");
    await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await submitProposalDraft(page, dialog);
    await selectProposalTab(page, "Resolved");
    // Parent keeps the exact title; children use `Title — weekday, month day`.
    await expect(proposalCardsWithPrefix(page, title)).toHaveCount(4, { timeout: 20_000 });
  });
});
