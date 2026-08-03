import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { dismissBlockingDialogsIfOpen } from "./helpers/motd";
import {
  openProposalFromInbox,
} from "./helpers/notifications";
import {
  goToProposals,
  openProposalCard,
  selectProposalTab,
  waitForProposalDetailReady,
} from "./helpers/navigation";
import {
  castAllPollSlotVotes,
  createAndSubmitPoll,
  expectResolvedProposal,
  proposalCard,
} from "./helpers/proposals";
import { dateOffsetIso } from "./helpers/schedule";

/**
 * PC-325 / REQ-E2E-POLL-INV-001: poll with 3 slots, 2 required + 1 optional.
 * One required opens via notification; the other via Proposed; optional declines with a note
 * while the poll is still Proposed; proposer sees the decline and message.
 */
test.describe("Poll optional decline journey", () => {
  test("required approve via inbox open + proposal; optional declines with note visible to proposer", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const tag = Date.now();
    const pollTitle = `E2E Poll Optional ${tag}`;
    const declineNote = `Optional decline — prior commitment (${tag})`;
    const dayA = dateOffsetIso(10);
    const dayB = dateOffsetIso(11);
    const dayC = dateOffsetIso(12);
    const slots = [`${dayA}T10:00`, `${dayB}T14:00`, `${dayC}T18:00`];

    // —— Proposer creates a 3-slot poll: 2 required, 1 optional ——
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitPoll(page, {
      title: pollTitle,
      description: "Three slot options for the alliance.",
      requiredNames: [USERS.leia.displayName, USERS.han.displayName],
      optionalNames: [USERS.chewie.displayName],
      slotStarts: slots,
      slotLabels: [`Slot A (${tag})`, `Slot B (${tag})`, `Slot C (${tag})`],
    });
    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, pollTitle)).toBeVisible({ timeout: 20_000 });

    // —— Required 1 (Leia): open via notification, accept all slots ——
    await logout(page);
    await login(page, USERS.leia.username);
    await dismissBlockingDialogsIfOpen(page);
    await openProposalFromInbox(page, pollTitle);
    const leiaDialog = page.getByRole("dialog");
    await waitForProposalDetailReady(leiaDialog);
    await castAllPollSlotVotes(leiaDialog, "Accept", page);
    const leiaClose = leiaDialog.getByRole("button", { name: "Close" });
    if (await leiaClose.isVisible().catch(() => false)) {
      await leiaClose.click();
    }
    await expect(leiaDialog).toBeHidden({ timeout: 25_000 }).catch(() => {});

    // —— Optional (Chewie): see in Proposed and decline with a note (before resolve) ——
    await logout(page);
    await login(page, USERS.chewie.username);
    await dismissBlockingDialogsIfOpen(page);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, pollTitle);
    const chewieDialog = page.getByRole("dialog");
    await chewieDialog.getByPlaceholder("Add a comment…").fill(declineNote);
    await chewieDialog.getByRole("button", { name: "Post" }).click();
    await expect(chewieDialog.getByText(declineNote)).toBeVisible({ timeout: 15_000 });
    await castAllPollSlotVotes(chewieDialog, "Decline", page);
    await expect(chewieDialog.getByText("Declined", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    const chewieClose = chewieDialog.getByRole("button", { name: "Close" });
    if (await chewieClose.isVisible().catch(() => false)) {
      await chewieClose.click();
    }
    await expect(chewieDialog).toBeHidden({ timeout: 25_000 }).catch(() => {});

    // —— Required 2 (Han): open from Proposed and accept all slots → resolve ——
    await logout(page);
    await login(page, USERS.han.username);
    await dismissBlockingDialogsIfOpen(page);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, pollTitle);
    const hanDialog = page.getByRole("dialog");
    await castAllPollSlotVotes(hanDialog, "Accept", page);
    const resolvedInDialog = await hanDialog
      .getByText("RESOLVED", { exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (!resolvedInDialog) {
      const hanCloseSoft = hanDialog.getByRole("button", { name: "Close" });
      if (await hanCloseSoft.isVisible().catch(() => false)) {
        await hanCloseSoft.click();
      }
      await expect(hanDialog).toBeHidden({ timeout: 15_000 }).catch(() => {});
      await expectResolvedProposal(page, pollTitle);
    } else {
      await expect(hanDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
        timeout: 25_000,
      });
      const hanClose = hanDialog.getByRole("button", { name: "Close" });
      if (await hanClose.isVisible().catch(() => false)) {
        await hanClose.click();
      }
      await expect(hanDialog).toBeHidden({ timeout: 25_000 }).catch(() => {});
    }

    // —— Proposer sees the decline and the message ——
    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, pollTitle);
    const lukeDialog = page.getByRole("dialog");
    await expect(lukeDialog.getByText("Declined", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(lukeDialog.getByText(declineNote)).toBeVisible({ timeout: 15_000 });
    await expect(lukeDialog.getByText(USERS.chewie.displayName).first()).toBeVisible();
  });
});
