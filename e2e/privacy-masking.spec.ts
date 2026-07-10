import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import { expandDraftMoreOptions, openEventProposalDraft, proposalCard, submitProposalDraft } from "./helpers/proposals";

test.describe("Privacy masking", () => {
  test("admin without private visibility sees masked resolved private event", async ({ page }) => {
    test.setTimeout(180_000);

    const title = `Private mask ${Date.now()}`;

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await expandDraftMoreOptions(dialog);
    await dialog.getByLabel("Privacy").click();
    await page.getByRole("option", { name: "Private", exact: true }).click();
    await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-09-01T19:00");
    await fillProposalDateTimeField(
      dialog.getByLabel("End (optional)").first(),
      "2099-09-01T21:00",
    );
    await submitProposalDraft(page, dialog);
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");

    const card = proposalCard(page, "Private event");
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).not.toContainText(title);
  });
});
