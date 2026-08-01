import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { expandDraftMoreOptions, openEventOrSleepingProposalDraft, proposalCard, setInviteeRequired } from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

test.describe("Proposal invitee journey", () => {
  test("proposer submits, invitee adds attendee and accepts, new invitee abstains", async ({
    page,
  }) => {
    const title = `E2E Journey ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToProposals(page);
    const draftDialog = await openEventOrSleepingProposalDraft(page);
    await draftDialog.getByLabel("Title").fill(title);
    await expandDraftMoreOptions(draftDialog);
    await draftDialog.getByLabel(/Description/i).fill("Single invitee then attendee add.");
    await setInviteeRequired(draftDialog, USERS.leia.displayName);
    await fillProposalDateTimeField(draftDialog.getByLabel("Start").first(), "2099-07-10T18:00");
    await draftDialog.getByRole("button", { name: "Save", exact: true }).click();

    await draftDialog.getByRole("button", { name: "Submit" }).click();
    await expect(draftDialog).toBeHidden({ timeout: 15_000 });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);

    const leiaDialog = page.getByRole("dialog");
    await leiaDialog.getByRole("button", { name: "Accept" }).click();
    await expectToast(page, /Vote recorded/i);
    await expect(leiaDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(leiaDialog.getByText("Winning slot", { exact: true })).toHaveCount(0);

    await leiaDialog.getByLabel("Add attendee").click();
    await page.getByRole("option", { name: USERS.han.displayName }).click();
    await leiaDialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(leiaDialog.getByText(USERS.han.displayName)).toBeVisible({ timeout: 15_000 });
    await expect(leiaDialog.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(leiaDialog.getByText(/added required: Han Solo/i)).toBeVisible({ timeout: 15_000 });

    await logout(page);
    await login(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, title);

    const hanDialog = page.getByRole("dialog");
    await hanDialog.getByRole("button", { name: "Abstain" }).click();
    await expectToast(page, /Vote recorded/i);
    await expect(hanDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible();
    await expect(hanDialog.getByText("Abstained", { exact: true })).toBeVisible();
    await expect(hanDialog.getByText("Accepted", { exact: true })).toBeVisible();
    await expect(hanDialog.getByText(/Submitted to network/i)).toBeVisible();
    await expect(hanDialog.getByText(/added required: Han Solo/i)).toBeVisible();
  });
});
