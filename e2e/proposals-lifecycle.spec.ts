import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { fillProposalDateTimeField, selectDraftScheduleMode } from "./helpers/datePickers";
import { DEMO, USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { exitDraftDialog, expandDraftMoreOptions, openEventOrSleepingProposalDraft } from "./helpers/proposals";

function proposalCard(page: import("@playwright/test").Page, title: string) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { name: title, level: 2 }),
  });
}

test.describe("Resolved proposal actions", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
  });

  test("proposer can clone a resolved proposal into a new draft", async ({ page }) => {
    await openProposalCard(page, DEMO.resolvedCelebration);
    await page.getByRole("dialog").getByRole("button", { name: "Clone" }).click();
    const draftDialog = page.getByRole("dialog");
    await expect(draftDialog.getByRole("button", { name: "Submit" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(draftDialog.getByLabel("Title")).toHaveValue(/\(copy\)/);
    await draftDialog.getByRole("button", { name: "Exit" }).click();
    await selectProposalTab(page, "Drafts");
    await expect(proposalCard(page, `${DEMO.resolvedCelebration} (copy)`)).toBeVisible();
  });

  test("proposer can re-draft a resolved proposal", async ({ page }) => {
    page.once("dialog", (dialog) => dialog.accept());
    await openProposalCard(page, DEMO.resolvedCelebration);
    await page.getByRole("dialog").getByRole("button", { name: "Re-draft" }).click();
    const draftDialog = page.getByRole("dialog");
    await expect(draftDialog.getByRole("button", { name: "Submit" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(draftDialog.getByText("Edit draft")).toBeVisible();
  });

  test("resolved detail shows card-styled layout with activity section", async ({ page }) => {
    await openProposalCard(page, DEMO.resolvedCelebration);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("EVENT PROPOSAL")).toBeVisible();
    await expect(dialog.getByText("RESOLVED")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});

test.describe("Poll proposal draft", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("creates a poll draft with multiple time slots", async ({ page }) => {
    const title = `E2E Poll ${Date.now()}`;
    const dialog = await openEventOrSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await selectDraftScheduleMode(dialog, "Poll");
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Description/i).fill("Poll with two options.");

    const startInputs = dialog.getByLabel("Start");
    await fillProposalDateTimeField(startInputs.nth(0), "2099-08-01T10:00");
    await dialog.getByRole("button", { name: "Add poll option" }).click();
    await fillProposalDateTimeField(startInputs.nth(1), "2099-08-02T10:00");

    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await exitDraftDialog(dialog);
    await expect(proposalCard(page, title)).toBeVisible();
    await proposalCard(page, title).getByRole("button", { name: "Continue Editing" }).click();
    await expect(dialog.getByRole("button", { name: "Poll", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog.getByRole("button", { name: "Recurring", exact: true })).toBeDisabled();
  });
});

test.describe("Recurring event draft", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("creates a recurring event draft with pattern controls", async ({ page }) => {
    const title = `E2E Recurring ${Date.now()}`;
    const dialog = await openEventOrSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await selectDraftScheduleMode(dialog, "Recurring");
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel(/Description/i).fill("Weekly council meetings.");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-09-01T09:00");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await exitDraftDialog(dialog);
    await expect(proposalCard(page, title)).toBeVisible();
  });
});
