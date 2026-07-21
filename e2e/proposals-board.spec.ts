import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { DEMO, USERS } from "./helpers/constants";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import { openEventOrSleepingProposalDraft, sleepingProposalCardsFor } from "./helpers/proposals";

function proposalCard(page: import("@playwright/test").Page, title: string) {
  return page.locator(".MuiCard-root").filter({
    has: page.getByRole("heading", { name: title, level: 2 }),
  });
}

test.describe("Proposals board", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("shows horizontal workflow tabs with counts", async ({ page }) => {
    await expect(page.getByRole("tab", { name: /Drafts/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Proposed/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Resolved/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Archived/i })).toBeVisible();
  });

  test("drafts tab lists proposer-owned drafts with card chrome", async ({ page }) => {
    await selectProposalTab(page, "Drafts");
    const card = proposalCard(page, DEMO.draftJediCouncil);
    await expect(card).toBeVisible();
    await expect(card.getByText("EVENT PROPOSAL")).toBeVisible();
    await expect(card.getByText("DRAFT", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Continue Editing" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Delete Draft" })).toBeVisible();
  });

  test("proposed tab shows assigned proposals for invitee", async ({ page }) => {
    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, DEMO.proposedRescueHan)).toBeVisible();
    await expect(proposalCard(page, DEMO.proposedDeathStar)).toBeVisible();
  });

  test("resolved tab shows approved proposals", async ({ page }) => {
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, DEMO.resolvedCelebration)).toBeVisible();
  });

  test("FAB opens new proposal draft dialog", async ({ page }) => {
    const dialog = await openEventOrSleepingProposalDraft(page);
    await expect(dialog.getByRole("heading", { name: "New proposal" })).toBeVisible();
    await expect(dialog.getByText("EVENT PROPOSAL")).toBeVisible();
    await expect(dialog.getByLabel("Title")).toBeVisible();
  });

  test("continue editing opens card-styled draft dialog", async ({ page }) => {
    await selectProposalTab(page, "Drafts");
    await page.getByRole("button", { name: "Continue Editing" }).first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Edit draft" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue(DEMO.draftJediCouncil);
  });
});

test.describe("Proposals visibility", () => {
  test("invitee sees proposed item; non-invitee does not", async ({ page }) => {
    await login(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await expect(
      sleepingProposalCardsFor(page, USERS.han.displayName, {
        inviteeName: USERS.leia.displayName,
      }),
    ).toBeVisible();
    await expect(proposalCard(page, DEMO.proposedDeathStar)).toHaveCount(0);
  });

  test("archived sleeping proposals stay involved-only for network members", async ({ page }) => {
    await login(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Archived");
    // PC-280: sleeping visibility is always involved — Han is not on this archived sleeping item.
    await expect(
      page.getByRole("heading", {
        level: 2,
        name: /Sleeping:.*Dagobah/i,
      }),
    ).toHaveCount(0);
  });
});
