import { test, expect } from "@playwright/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resetE2eDatabase } from "./helpers/db";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { expectInAppNotification } from "./helpers/notifications";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import {
  castPollSlotVote,
  createAndSubmitPoll,
  openDraftForEdit,
  submitProposalDraft,
} from "./helpers/proposals";

/** Shared poll title across serial journey phases (set in phase 1). */
let pollTitle = "";
const slot1 = "2099-10-01T14:00";
const slot2 = "2099-10-02T14:00";
const slot3 = "2099-10-03T14:00";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await resetE2eDatabase(request);
});

test.describe("Death Star poll journey", () => {
  test("phase 1: Han proposes poll; Leia and Luke cast cross-votes", async ({ page }) => {
    test.setTimeout(180_000);

    const tag = Date.now();
    pollTitle = `E2E Death Star ${tag}`;

    await login(page, USERS.han.username);
    await goToProposals(page);
    await createAndSubmitPoll(page, {
      title: pollTitle,
      description: "Coordinated assault planning",
      requiredNames: [USERS.luke.displayName, USERS.leia.displayName],
      slotStarts: [slot1, slot2],
      slotLabels: [`Yavin briefing (${tag})`, `Endor briefing (${tag})`],
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, pollTitle);
    const leiaDialog = page.getByRole("dialog");
    await castPollSlotVote(leiaDialog, 0, "Sub-opt");
    await castPollSlotVote(leiaDialog, 1, "Decline");
    await leiaDialog.getByRole("button", { name: "Close" }).click();

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, pollTitle);
    const lukeDialog = page.getByRole("dialog");
    await castPollSlotVote(lukeDialog, 0, "Decline");
    await castPollSlotVote(lukeDialog, 1, "Accept");
    await lukeDialog.getByRole("button", { name: "Close" }).click();
  });

  test("phase 2: Han redrafts with a third slot after draft notification", async ({ page }) => {
    test.setTimeout(150_000);

    await logout(page);
    await login(page, USERS.han.username);
    await expectInAppNotification(page, /moved back to drafts/i);
    await goToProposals(page);
    await selectProposalTab(page, "Drafts");
    const hanDraft = await openDraftForEdit(page, pollTitle);
    await hanDraft.getByRole("button", { name: "Add poll option" }).click();
    await hanDraft.getByLabel("Option 3 label").fill(`Coruscant briefing (${pollTitle})`);
    await fillProposalDateTimeField(hanDraft.getByLabel("Start").nth(2), slot3);
    await submitProposalDraft(page, hanDraft);
  });

  test("phase 3: unanimous votes resolve poll; proposer notified", async ({ page }) => {
    test.setTimeout(180_000);

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, pollTitle);
    const leiaVoteDialog = page.getByRole("dialog");
    await castPollSlotVote(leiaVoteDialog, 0, "Accept");
    await castPollSlotVote(leiaVoteDialog, 1, "Accept");
    await castPollSlotVote(leiaVoteDialog, 2, "Accept");
    await leiaVoteDialog.getByRole("button", { name: "Close" }).click();

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, pollTitle);
    const lukeVoteDialog = page.getByRole("dialog");
    await castPollSlotVote(lukeVoteDialog, 0, "Accept");
    await castPollSlotVote(lukeVoteDialog, 1, "Accept");
    await castPollSlotVote(lukeVoteDialog, 2, "Accept");
    await expect(lukeVoteDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    await logout(page);
    await login(page, USERS.han.username);
    await expectInAppNotification(page, /approved and scheduled/i);
  });
});
