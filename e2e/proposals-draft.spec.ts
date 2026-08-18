import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { DEMO, USERS } from "./helpers/constants";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import {
  exitDraftDialog,
  expandDraftMoreOptions,
  openEventOrSleepingProposalDraft,
  proposalCard,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";

test.describe("Proposal draft workflows", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("keeps Submit disabled until required New Event fields are complete", async ({ page }) => {
    const dialog = await openEventOrSleepingProposalDraft(page);
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();
    await dialog.getByLabel("Title").fill(`E2E Incomplete ${Date.now()}`);
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await exitDraftDialog(dialog);
    await selectProposalTab(page, "Drafts");
    await expect(proposalCard(page, /E2E Incomplete/)).toHaveCount(0);
  });

  test("edits an existing seed draft title then submits", async ({ page }) => {
    const updatedTitle = `Updated Jedi Council ${Date.now()}`;

    await selectProposalTab(page, "Drafts");
    await page.getByRole("button", { name: "Continue Editing" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit draft" })).toBeVisible();
    await page.getByLabel("Title").fill(updatedTitle);
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-08-01T10:00");
    await setInviteeRequired(dialog, USERS.leia.displayName);
    await submitProposalDraft(page, dialog);

    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, updatedTitle)).toBeVisible({ timeout: 20_000 });
  });

  test("deletes a draft after confirmation", async ({ page }) => {
    await selectProposalTab(page, "Drafts");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Draft" }).first().click();
    await expect(proposalCard(page, DEMO.draftJediCouncil)).toHaveCount(0);
  });
});

test.describe("Proposal submit and conflict warnings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("submits a complete New Event to proposed state", async ({ page }) => {
    const title = `E2E Submit ${Date.now()}`;
    const dialog = await openEventOrSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-08-01T10:00");
    await setInviteeRequired(dialog, USERS.leia.displayName);
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Details/i).fill("Needs invitee vote.");
    await submitProposalDraft(page, dialog);

    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, title)).toBeVisible();
  });
});
