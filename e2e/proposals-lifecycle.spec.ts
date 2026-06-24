import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { DEMO, USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";

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
    await expect(page.getByRole("dialog").getByText(/Draft created from proposal/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await selectProposalTab(page, "Drafts");
    await expect(proposalCard(page, DEMO.resolvedCelebration)).toBeVisible();
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
    await page.getByRole("button", { name: "New proposal" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Description").fill("Poll with two options.");
    await dialog.getByRole("checkbox", { name: /Time poll/i }).check();

    const startInputs = dialog.getByLabel("Start");
    await startInputs.nth(0).fill("2099-08-01T10:00");
    await dialog.getByRole("button", { name: "Add poll option" }).click();
    await startInputs.nth(1).fill("2099-08-02T10:00");

    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(proposalCard(page, title)).toBeVisible();
    await proposalCard(page, title).getByRole("button", { name: "Continue Editing" }).click();
    await expect(dialog.getByRole("checkbox", { name: /Time poll/i })).toBeChecked();
  });
});

test.describe("Recurring event draft", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("creates a recurring event draft with pattern controls", async ({ page }) => {
    const title = `E2E Recurring ${Date.now()}`;
    await page.getByRole("button", { name: "New proposal" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Description").fill("Weekly council meetings.");
    await dialog.getByRole("checkbox", { name: /Recurring series/i }).check();
    await dialog.getByLabel("Start").first().fill("2099-09-01T09:00");
    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(proposalCard(page, title)).toBeVisible();
  });
});
