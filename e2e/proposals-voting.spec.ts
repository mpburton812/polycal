import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { DEMO, USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";

test.describe("Proposal voting", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
  });

  test("required invitee can accept a standard event proposal", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openProposalCard(page, DEMO.proposedDeathStar);
    await dialog.getByRole("button", { name: "Accept" }).click();
    await expect(dialog.getByText(/Vote recorded/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText(USERS.luke.displayName)).toBeVisible();
    await expect(dialog.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Accept" })).toHaveCount(0);
  });

  test("required invitee can abstain on a proposed event", async ({ page }) => {
    const dialog = page.getByRole("dialog");
    await openProposalCard(page, DEMO.proposedRescueHan);
    await dialog.getByRole("button", { name: "Abstain" }).click();
    await expect(dialog.getByText(/Vote recorded/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText("Abstained", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Abstain" })).toHaveCount(0);
  });

  test("detail dialog shows invitee vote controls and comments", async ({ page }) => {
    await openProposalCard(page, DEMO.proposedDeathStar);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Accept" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Decline" })).toBeVisible();
    await expect(dialog.getByPlaceholder("Add a comment…")).toBeVisible();
  });
});

test.describe("Proposal comments", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
  });

  test("invitee can post a comment on a proposed item", async ({ page }) => {
    const comment = `E2E comment ${Date.now()}`;
    await openProposalCard(page, DEMO.proposedDeathStar);
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder("Add a comment…").fill(comment);
    await dialog.getByRole("button", { name: "Post" }).click();
    await expect(dialog.getByText(comment)).toBeVisible({ timeout: 15_000 });
  });
});
