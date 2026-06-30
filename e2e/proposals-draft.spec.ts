import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { DEMO, USERS } from "./helpers/constants";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import { exitDraftDialog, openEventOrSleepingProposalDraft } from "./helpers/proposals";

function proposalCard(page: import("@playwright/test").Page, title: string) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { name: title, level: 2 }),
  });
}

test.describe("Proposal draft workflows", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("creates a new event draft and lists it on the board", async ({ page }) => {
    const title = `E2E Test Event ${Date.now()}`;

    const dialog = await openEventOrSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel(/Description/i).fill("Automated E2E draft creation.");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await exitDraftDialog(dialog);

    const card = proposalCard(page, title);
    await expect(card).toBeVisible();
    await expect(card.getByText("DRAFT", { exact: true })).toBeVisible();
  });

  test("edits an existing draft title", async ({ page }) => {
    const updatedTitle = `Updated Jedi Council ${Date.now()}`;

    await selectProposalTab(page, "Drafts");
    await page.getByRole("button", { name: "Continue Editing" }).first().click();
    await page.getByLabel("Title").fill(updatedTitle);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await exitDraftDialog(dialog);

    await expect(proposalCard(page, updatedTitle)).toBeVisible();
  });

  test("deletes a draft after confirmation", async ({ page }) => {
    await selectProposalTab(page, "Drafts");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete Draft" }).first().click();
    await expect(proposalCard(page, DEMO.draftJediCouncil)).toHaveCount(0);
  });

  test("creates a draft without optional description", async ({ page }) => {
    const title = `E2E No Description ${Date.now()}`;

    const dialog = await openEventOrSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await exitDraftDialog(dialog);
    await expect(proposalCard(page, title)).toBeVisible();
  });
});

test.describe("Proposal submit and conflict warnings", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("submits a draft to proposed state", async ({ page }) => {
    const title = `E2E Submit ${Date.now()}`;
    const dialog = await openEventOrSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel(/Description/i).fill("Needs invitee vote.");
    await dialog.getByRole("button", { name: /Leia Organa/i }).click();
    await dialog.getByRole("button", { name: "Save", exact: true }).click();

    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, title)).toBeVisible();
  });
});
