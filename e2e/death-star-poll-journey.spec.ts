import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { expectInAppNotification } from "./helpers/notifications";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import {
  castPollSlotVote,
  createAndSubmitPoll,
  openDraftForEdit,
  submitProposalDraft,
} from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

test.describe("Death Star poll journey", () => {
  test("multi-date poll with comments, cross-votes, redraft, and resolution", async ({
    page,
  }) => {
    test.setTimeout(420_000);

    const tag = Date.now();
    const title = `E2E Death Star ${tag}`;
    const slot1 = "2099-10-01T14:00";
    const slot2 = "2099-10-02T14:00";
    const slot3 = "2099-10-03T14:00";

    // —— Han proposes poll with two slots and comments ——
    await login(page, USERS.han.username);
    await goToProposals(page);
    await createAndSubmitPoll(page, {
      title,
      description: "Coordinated assault planning",
      requiredNames: [USERS.luke.displayName, USERS.leia.displayName],
      slotStarts: [slot1, slot2],
      slotLabels: [`Yavin briefing (${tag})`, `Endor briefing (${tag})`],
    });

    // —— Leia: sub-opt slot 1, decline slot 2 ——
    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);
    const leiaDialog = page.getByRole("dialog");
    await castPollSlotVote(leiaDialog, 0, "Sub-opt");
    await expectToast(page, /Slot vote recorded/i);
    await castPollSlotVote(leiaDialog, 1, "Decline");
    await expectToast(page, /Slot vote recorded/i);
    await leiaDialog.getByRole("button", { name: "Close" }).click();

    // —— Luke: decline slot 1, accept slot 2 ——
    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);
    const lukeDialog = page.getByRole("dialog");
    await castPollSlotVote(lukeDialog, 0, "Decline");
    await expectToast(page, /Slot vote recorded/i);
    await castPollSlotVote(lukeDialog, 1, "Accept");
    await expectToast(page, /Slot vote recorded/i);
    await lukeDialog.getByRole("button", { name: "Close" }).click();

    // —— Han: poll returns to draft; add third slot and resubmit ——
    await logout(page);
    await login(page, USERS.han.username);
    await expectInAppNotification(page, /moved back to drafts/i);
    await goToProposals(page);
    await selectProposalTab(page, "Drafts");
    const hanDraft = await openDraftForEdit(page, title);
    await hanDraft.getByRole("button", { name: "Add poll option" }).click();
    await hanDraft.getByLabel("Option 3 label").fill(`Coruscant briefing (${tag})`);
    await fillProposalDateTimeField(hanDraft.getByLabel("Start").nth(2), slot3);
    await submitProposalDraft(page, hanDraft);

    // —— Leia accepts all three slots ——
    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);
    const leiaVoteDialog = page.getByRole("dialog");
    await castPollSlotVote(leiaVoteDialog, 0, "Accept");
    await castPollSlotVote(leiaVoteDialog, 1, "Accept");
    await castPollSlotVote(leiaVoteDialog, 2, "Accept");
    await leiaVoteDialog.getByRole("button", { name: "Close" }).click();

    // —— Luke accepts all three slots ——
    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);
    const lukeVoteDialog = page.getByRole("dialog");
    await castPollSlotVote(lukeVoteDialog, 0, "Accept");
    await castPollSlotVote(lukeVoteDialog, 1, "Accept");
    await castPollSlotVote(lukeVoteDialog, 2, "Accept");
    await expect(lukeVoteDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // —— Han sees resolution notification ——
    await logout(page);
    await login(page, USERS.han.username);
    await expectInAppNotification(page, /approved and scheduled/i);
  });
});
