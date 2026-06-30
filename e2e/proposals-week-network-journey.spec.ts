import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { expectInAppNotification } from "./helpers/notifications";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import {
  createAndSubmitEvent,
  createAndSubmitSoloSleepingWeek,
  proposalCardsWithPrefix,
} from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

test.describe("Week schedule poly-family journey", () => {
  test("proposer schedules solo week + social events, cancels a night, required accepts and optional declines with notes, notifications match actions", async ({
    page,
  }) => {
    test.setTimeout(420_000);

    const tag = Date.now();
    const weekPrefix = `E2E Week ${tag}`;
    const brunchTitle = `E2E Social Brunch ${tag}`;
    const gameTitle = `E2E Social Game ${tag}`;
    const dinnerTitle = `E2E Family Dinner ${tag}`;
    const declineNote = `Can't make it — prior commitment (${tag})`;
    const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // —— Phase 1: Luke schedules a week of intentional-solo sleeping nights ——
    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);

    const nightCount = await createAndSubmitSoloSleepingWeek(page, {
      titlePrefix: weekPrefix,
      rangeStart: "2099-07-07",
      rangeEnd: "2099-07-13",
    });
    expect(nightCount).toBe(7);

    await selectProposalTab(page, "Resolved");
    await expect(proposalCardsWithPrefix(page, weekPrefix)).toHaveCount(1);

    // —— Phase 2: Luke schedules social events through the week with poly family ——
    await createAndSubmitEvent(page, {
      title: brunchTitle,
      description: "Morning brunch with the alliance.",
      requiredName: USERS.leia.displayName,
      optionalName: USERS.han.displayName,
      start: "2099-08-08T10:00",
    });

    await createAndSubmitEvent(page, {
      title: gameTitle,
      description: "Evening game night.",
      requiredName: USERS.leia.displayName,
      optionalName: USERS.han.displayName,
      start: "2099-08-10T19:00",
    });

    await selectProposalTab(page, "Proposed");
    await expect(page.getByRole("heading", { name: brunchTitle, level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: gameTitle, level: 2 })).toBeVisible();

    // —— Phase 3: Luke cancels the batch week proposal ——
    await selectProposalTab(page, "Resolved");
    const batchCard = proposalCardsWithPrefix(page, weekPrefix).first();
    const cancelledBatchTitle = await batchCard.getByRole("heading", { level: 2 }).innerText();

    page.once("dialog", (dialog) => dialog.accept());
    await batchCard.getByRole("heading", { level: 2 }).click();
    const cancelDialog = page.getByRole("dialog");
    await cancelDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(cancelDialog).toBeHidden({ timeout: 15_000 });

    await selectProposalTab(page, "Archived");
    await expect(page.getByRole("heading", { name: cancelledBatchTitle, level: 2 })).toBeVisible();
    await selectProposalTab(page, "Resolved");
    await expect(proposalCardsWithPrefix(page, weekPrefix)).toHaveCount(0);

    // —— Phase 4: Luke proposes dinner with required + optional invitees ——
    await createAndSubmitEvent(page, {
      title: dinnerTitle,
      description: "Family dinner — required + optional votes.",
      requiredName: USERS.leia.displayName,
      optionalName: USERS.han.displayName,
      start: "2099-08-11T18:00",
    });

    // —— Phase 5: Leia (required) accepts ——
    await logout(page);
    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, dinnerTitle);

    const leiaDialog = page.getByRole("dialog");
    await leiaDialog.getByRole("button", { name: "Accept" }).click();
    await expectToast(page, /Vote recorded/i);
    await expect(leiaDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await leiaDialog.getByRole("button", { name: "Close" }).click();

    // —— Phase 6: Han (optional) declines with a comment note ——
    await logout(page);
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, dinnerTitle);

    const hanDialog = page.getByRole("dialog");
    await hanDialog.getByPlaceholder("Add a comment…").fill(declineNote);
    await hanDialog.getByRole("button", { name: "Post" }).click();
    await expect(hanDialog.getByText(declineNote)).toBeVisible({ timeout: 15_000 });
    await hanDialog.getByRole("button", { name: "Decline" }).click();
    await expectToast(page, /Vote recorded/i);
    await expect(hanDialog.getByText("Declined", { exact: true })).toBeVisible();
    await expect(hanDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible();
    await expect(hanDialog.getByText("Accepted", { exact: true })).toBeVisible();

    // —— Phase 7: Notifications reflect key actions for each actor ——
    await expectInAppNotification(page, new RegExp(escape(brunchTitle)));
    await expectInAppNotification(page, new RegExp(escape(gameTitle)));
    await expectInAppNotification(page, /needs your review/i);
    await expectInAppNotification(page, new RegExp(escape(dinnerTitle)));
    await expectInAppNotification(page, /approved and scheduled/i);

    await logout(page);
    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await expectInAppNotification(page, new RegExp(escape(dinnerTitle)));
    await expectInAppNotification(page, /needs your review/i);
    await expectInAppNotification(page, /approved and scheduled/i);

    await logout(page);
    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await expectInAppNotification(page, /A vote was cast on/i);
    await expectInAppNotification(page, new RegExp(escape(cancelledBatchTitle)));
    await expectInAppNotification(page, /was cancelled/i);
    await expectInAppNotification(page, /approved and scheduled/i);
  });
});
