import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import { expandDraftMoreOptions, openEventProposalDraft, proposalCard, submitProposalDraft } from "./helpers/proposals";

/**
 * Privacy levels (open/private/super_private) were removed for PC-280 — every
 * proposal is always "open" and content is never masked by privacy setting.
 * Sleeping involved-only masking (when applicable) uses "Busy" / Hidden copy (PC-282).
 */
test.describe("Privacy removal (PC-280)", () => {
  test("no Privacy control appears when drafting an event", async ({ page }) => {
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    const dialog = await openEventProposalDraft(page);
    await expect(dialog.getByLabel("Privacy")).toHaveCount(0);
    await expect(dialog.getByText("Private", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Super private", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Private event", { exact: true })).toHaveCount(0);
  });

  test("resolved event is fully visible to a non-invitee (no masking)", async ({ page }) => {
    test.setTimeout(120_000);

    const title = `Open event ${Date.now()}`;

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-09-02T19:00");
    await fillProposalDateTimeField(
      dialog.getByLabel("End (optional)").first(),
      "2099-09-02T21:00",
    );
    await submitProposalDraft(page, dialog);
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");

    const card = proposalCard(page, title);
    await expect(card).toBeVisible({ timeout: 15_000 });
  });
});
