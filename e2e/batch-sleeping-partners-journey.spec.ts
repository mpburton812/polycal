import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { BT_PLACES, BT_USERS, BURTON_THOMPSON_PASSWORD } from "./helpers/burton-thompson";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { expectInAppNotification } from "./helpers/notifications";
import { dateOffsetIso } from "./helpers/schedule";
import {
  configureBatchNight,
  openDraftForEdit,
  openSleepingProposalDraft,
  proposalCard,
  submitProposalDraft,
} from "./helpers/proposals";

test.describe("Batch sleeping partners journey", () => {
  test("Katie/Michael batch week with decline, edit, and accept", async ({ page }) => {
    test.setTimeout(360_000);

    const night0 = dateOffsetIso(2);
    const night1 = dateOffsetIso(3);
    const night2 = dateOffsetIso(4);
    const night3 = dateOffsetIso(5);

    const sleepingTitle = new RegExp(
      `Sleeping:.*${BT_USERS.katie.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );
    const declineComment = "I need to be at my place on the second night.";

    // —— Phase 1: Katie proposes a four-night batch ——
    await loginWithOnboardingIfNeeded(
      page,
      BT_USERS.katie.username,
      BURTON_THOMPSON_PASSWORD,
    );
    await goToProposals(page);

    const dialog = await openSleepingProposalDraft(page);
    await dialog.getByLabel("Title").fill(`E2E batch sleeping ${Date.now()}`);
    await dialog.getByRole("checkbox", { name: /Batch nights/i }).click();
    await expect(dialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible({ timeout: 15_000 });

    await configureBatchNight(dialog, page, night0, {
      nightDate: night0,
      mode: "solo",
      locationName: BT_PLACES.katiesPlace,
    });

    await configureBatchNight(dialog, page, night1, {
      nightDate: night1,
      mode: "solo",
      customLocation: BT_PLACES.michaelsPlace,
    });

    await configureBatchNight(dialog, page, night2, {
      nightDate: night2,
      mode: "withInvitees",
      requiredInvitees: [BT_USERS.michael.displayName],
      locationName: BT_PLACES.katiesPlace,
    });

    await configureBatchNight(dialog, page, night3, {
      nightDate: night3,
      mode: "withInvitees",
      requiredInvitees: [BT_USERS.michael.displayName],
      locationName: BT_PLACES.michaelsPlace,
    });

    await submitProposalDraft(page, dialog);
    await logout(page);

    // —— Phase 2: Michael reviews batch nights and declines ——
    await loginWithOnboardingIfNeeded(
      page,
      BT_USERS.michael.username,
      BURTON_THOMPSON_PASSWORD,
    );
    await expectInAppNotification(page, /Sleeping:/i);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, sleepingTitle);

    const michaelDialog = page.getByRole("dialog");
    await expect(michaelDialog.getByText("Batch nights (4)")).toBeVisible({ timeout: 15_000 });
    await expect(michaelDialog.getByText(new RegExp(night0))).toBeVisible();
    await expect(michaelDialog.getByText(/Night 1:.*Katie's Place/)).toBeVisible();

    await michaelDialog.getByPlaceholder("Add a comment…").fill(declineComment);
    await michaelDialog.getByRole("button", { name: "Post", exact: true }).click();
    await expect(michaelDialog.getByText(declineComment)).toBeVisible({ timeout: 15_000 });
    await michaelDialog.getByRole("button", { name: "Decline" }).click();
    await michaelDialog.getByRole("button", { name: "Close" }).click({ timeout: 25_000 });
    await logout(page);

    // —— Phase 3: Katie edits night 2 and re-submits ——
    await loginWithOnboardingIfNeeded(
      page,
      BT_USERS.katie.username,
      BURTON_THOMPSON_PASSWORD,
    );
    await expectInAppNotification(page, /sent back to drafts|cast a vote/i);
    await goToProposals(page);
    await selectProposalTab(page, "Drafts");

    const editDialog = await openDraftForEdit(page, sleepingTitle);
    await expect(editDialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible({ timeout: 15_000 });
    await configureBatchNight(editDialog, page, night1, {
      nightDate: night1,
      mode: "withInvitees",
      requiredInvitees: [BT_USERS.michael.displayName],
      locationName: BT_PLACES.michaelsPlace,
    });
    await submitProposalDraft(page, editDialog);
    await logout(page);

    // —— Phase 4: Michael accepts the revised batch ——
    await loginWithOnboardingIfNeeded(
      page,
      BT_USERS.michael.username,
      BURTON_THOMPSON_PASSWORD,
    );
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, sleepingTitle);
    const acceptDialog = page.getByRole("dialog");
    await acceptDialog.getByRole("button", { name: "Accept" }).click();
    await expect(acceptDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await acceptDialog.getByRole("button", { name: "Close" }).click();

    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, sleepingTitle)).toBeVisible({ timeout: 25_000 });
  });
});
