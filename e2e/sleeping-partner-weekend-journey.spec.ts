import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import {
  acceptProposalWithComment,
  configureBatchNight,
  openSleepingPartnerProposal,
  openSleepingProposalDraft,
  proposalCard,
  submitProposalDraft,
} from "./helpers/proposals";

test.describe("Sleeping partner weekend journey", () => {
  test("Luke partners with Leia, then proposes a 2-night weekend batch she accepts", async ({
    page,
  }) => {
    test.setTimeout(420_000);

    const batchTitle = `Weekend with Leia ${Date.now()}`;

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);

    const partnerDialog = await openSleepingPartnerProposal(page);
    await partnerDialog.getByRole("button", { name: USERS.leia.displayName }).click();
    await partnerDialog.getByRole("button", { name: "Propose" }).click();
    await expect(partnerDialog).toBeHidden({ timeout: 15_000 });
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, `Sleeping partnership with ${USERS.luke.displayName}`);
    await acceptProposalWithComment(page, "Happy to partner with you.");
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);

    const sleepingDialog = await openSleepingProposalDraft(page);
    await sleepingDialog
      .getByRole("checkbox", { name: "Batch (multiple nights in one proposal)" })
      .click();
    await sleepingDialog.getByLabel("Title").fill(batchTitle);

    await configureBatchNight(sleepingDialog, page, 0, {
      nightDate: "2099-12-06",
      mode: "withInvitees",
      requiredInvitees: [USERS.leia.displayName],
      customLocation: "Lars homestead guest room",
    });

    await sleepingDialog.getByRole("button", { name: "Add night" }).click();
    await configureBatchNight(sleepingDialog, page, 1, {
      nightDate: "2099-12-07",
      mode: "withInvitees",
      requiredInvitees: [USERS.leia.displayName],
      customLocation: "Lars homestead guest room",
    });

    await sleepingDialog.getByRole("button", { name: "Create draft" }).click();
    await submitProposalDraft(page, sleepingDialog);
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, batchTitle);
    await acceptProposalWithComment(page, "Both nights work for me.");
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, batchTitle)).toBeVisible({ timeout: 25_000 });
  });
});
