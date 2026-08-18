import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { dateOffsetIso } from "./helpers/schedule";
import { fillProposalDateRange } from "./helpers/datePickers";
import {
  acceptProposalWithComment,
  openSleepingPartnerProposal,
  openSleepingProposalDraft,
  proposalCard,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";

test.describe("Sleeping partner weekend journey", () => {
  test("Luke partners with Leia, then proposes a 2-night weekend batch she accepts", async ({
    page,
  }) => {
    test.setTimeout(420_000);

    const night0 = dateOffsetIso(6);
    const night1 = dateOffsetIso(7);

    const sleepingTitle = new RegExp(
      `Sleeping:.*${USERS.luke.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*${USERS.leia.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );

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
    await sleepingDialog.getByLabel("Title").fill(`E2E weekend ${Date.now()}`);
    await fillProposalDateRange(sleepingDialog, night0, night1);
    await setInviteeRequired(sleepingDialog, USERS.leia.displayName);
    await submitProposalDraft(page, sleepingDialog);
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, sleepingTitle);
    await acceptProposalWithComment(page, "Both nights work for me.");
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, sleepingTitle)).toBeVisible({ timeout: 25_000 });
  });
});
