import { expect, test } from "./helpers/test";

import { expandAdminSection, configureGroupNameProposals, selectGroupNameChangeMode } from "./helpers/admin";
import { login, loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin, goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { proposalCard, submitProposalDraft } from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

const DEFAULT_GROUP_NAME = "Rebel Alliance";

test.describe("Group name proposal journey", () => {
  test("admin enables rename proposals, consensus decline, auto rename resolves", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const proposedName = `Galactic Alliance ${Date.now()}`;
    const proposalTitle = `Rename group to "${proposedName}"`;

    // —— Phase 1: Luke enables group rename in mandatory consensus mode ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await configureGroupNameProposals(page, { mode: "Mandatory consensus" });

    // —— Phase 2: Propose rename (draft) and deep-link to proposals ——
    // Wait for post-save router.refresh() to settle so the fill isn't wiped by remount.
    await expect(page.getByLabel("Proposed new name")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Proposed new name").fill(proposedName);
    await expect(page.getByLabel("Proposed new name")).toHaveValue(proposedName);
    await Promise.all([
      page.waitForURL(/\/proposals\?open=/, { timeout: 30_000 }),
      page.getByRole("button", { name: "Propose name change (draft)" }).click(),
    ]);

    const draftDialog = page.getByRole("dialog");
    await expect(
      draftDialog.getByRole("heading", { name: proposalTitle, level: 2 }),
    ).toBeVisible({ timeout: 15_000 });
    await submitProposalDraft(page, draftDialog);

    await selectProposalTab(page, "Proposed");
    await expect(page.getByRole("heading", { name: proposalTitle, level: 2 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("GROUP RENAME").first()).toBeVisible();
    await expect(page.getByRole("banner").getByText(DEFAULT_GROUP_NAME)).toBeVisible();

    // —— Phase 3: Leia accepts (proposal stays proposed until consensus) ——
    await logout(page);
    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, proposalTitle);
    const leiaDialog = page.getByRole("dialog");
    await leiaDialog.getByRole("button", { name: "Accept" }).click();
    await expectToast(page, /Vote recorded/i);
    await leiaDialog.getByRole("button", { name: "Close" }).click({ timeout: 15_000 });
    await logout(page);

    // —— Phase 4: Han declines — mandatory consensus reverts to draft ——
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, proposalTitle);
    const hanDialog = page.getByRole("dialog");
    await hanDialog.getByRole("button", { name: "Decline" }).click();
    await expectToast(page, /Vote recorded/i);
    await hanDialog.getByRole("button", { name: "Close" }).click({ timeout: 15_000 });
    await logout(page);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Drafts");
    await expect(proposalCard(page, proposalTitle)).toBeVisible({ timeout: 15_000 });

    // —— Phase 5: Switch to auto mode and resubmit for immediate rename ——
    await goToAdmin(page);
    await expandAdminSection(page, "Poly group settings");
    await selectGroupNameChangeMode(page, /No votes required/i);
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /saved|updated/i })).toBeVisible({
      timeout: 15_000,
    });

    await goToProposals(page);
    await selectProposalTab(page, "Drafts");
    await openProposalCard(page, proposalTitle);
    const resubmitDialog = page.getByRole("dialog");
    await submitProposalDraft(page, resubmitDialog);

    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, proposalTitle)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("banner").getByText(proposedName)).toBeVisible();
  });
});
