import { expect, test } from "./helpers/test";

import { login, loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateField } from "./helpers/datePickers";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { expectInAppNotification } from "./helpers/notifications";
import {
  openEventOrSleepingProposalDraft,
  openSleepingPartnerProposal,
  proposalCard,
  submitProposalDraft,
} from "./helpers/proposals";

async function hanProposeSleepingPartner(
  page: import("@playwright/test").Page,
  partnerDisplayName: string,
): Promise<void> {
  const dialog = await openSleepingPartnerProposal(page);
  await dialog.getByRole("button", { name: partnerDisplayName }).click();
  await dialog.getByRole("button", { name: "Propose" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

test.describe("Sleeping partnership journey", () => {
  test("partnership proposals, comments, decline/accept, sleeping event", async ({ page }) => {
    test.setTimeout(360_000);

    const sleepingTitle = `Falcon night ${Date.now()}`;

    // —— Phase 1: Han proposes sleeping partnerships via Proposals FAB ——
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);
    await hanProposeSleepingPartner(page, USERS.chewie.displayName);
    await hanProposeSleepingPartner(page, USERS.anakin.displayName);
    await logout(page);

    // —— Phase 2: Chewbacca declines via notification with comment ——
    await login(page, USERS.chewie.username);
    await expectInAppNotification(page, /sleeping partnership/i);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, `Sleeping partnership with ${USERS.han.displayName}`);
    const chewieDialog = page.getByRole("dialog");
    await chewieDialog
      .getByPlaceholder("Add a comment (optional)…")
      .fill("sorry not at the moment");
    await chewieDialog.getByRole("button", { name: "Decline" }).click();
    await logout(page);

    // —— Phase 3: Anakin accepts via Proposals with comment ——
    await loginWithOnboardingIfNeeded(page, USERS.anakin.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, `Sleeping partnership with ${USERS.han.displayName}`);
    const anakinDialog = page.getByRole("dialog");
    await anakinDialog.getByPlaceholder("Add a comment (optional)…").fill("Yes, delighted!");
    await anakinDialog.getByRole("button", { name: "Accept" }).click();
    await logout(page);

    // —— Phase 4: Han sees acceptance notification ——
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await expectInAppNotification(page, /accepted your sleeping partnership/i);

    // —— Phase 5: Han proposes sleeping event with Anakin at Millennium Falcon ——
    await goToProposals(page);
    const draft = await openEventOrSleepingProposalDraft(page);
    await draft.getByLabel("Type").click();
    await page.getByRole("option", { name: "Sleeping" }).click();
    await draft.getByLabel("Title").fill(sleepingTitle);
    await setInviteeRequiredIfNeeded(draft, USERS.anakin.displayName);
    await draft.getByLabel("Custom location (optional)").fill("Millennium Falcon");
    await fillProposalDateField(draft.getByLabel("Night of").first(), "2099-07-06");
    await draft.getByRole("button", { name: "Create draft" }).click();
    await submitProposalDraft(page, draft);
    await logout(page);

    // —— Phase 6: Anakin accepts sleeping proposal ——
    await loginWithOnboardingIfNeeded(page, USERS.anakin.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, sleepingTitle);
    await page.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
    await logout(page);

    // —— Phase 7: Han sees resolved sleeping event ——
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, sleepingTitle)).toBeVisible({ timeout: 25_000 });
  });
});

async function setInviteeRequiredIfNeeded(
  dialog: import("@playwright/test").Locator,
  displayName: string,
): Promise<void> {
  const chip = dialog.getByRole("button", { name: new RegExp(displayName, "i") });
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
    await expect(chip).toHaveText(new RegExp(`${displayName} \\(required\\)`, "i"));
  }
}
