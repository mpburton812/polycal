import { expect, test } from "./helpers/test";

import { deleteUserInAdmin, expandAdminSection, pauseUserInAdmin, resumeUserInAdmin } from "./helpers/admin";
import { expectLoginRejected, login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin, goToPeoplePlaces, goToProposals, selectProposalTab } from "./helpers/navigation";
import { createAndSubmitRecurringEventForEveryone, proposalCardsWithPrefix } from "./helpers/proposals";

test.describe("Admin bad user lifecycle journey", () => {
  test("pause blocks app access, resume restores scheduling, delete removes user artifacts", async ({
    page,
  }) => {
    test.setTimeout(420_000);

    const tag = Date.now();
    const firstSeriesTitle = `E2E Bad Recurring A ${tag}`;
    const secondSeriesTitle = `E2E Bad Recurring B ${tag}`;
    const placeName = "Bad User Hideout";

    // —— Phase 1: bad_user schedules a 4-week recurring event for everyone ——
    await login(page, USERS.badUser.username);
    await goToProposals(page);
    await createAndSubmitRecurringEventForEveryone(page, {
      title: firstSeriesTitle,
      start: "2099-11-03T18:00",
      end: "2099-11-03T20:00",
      occurrenceCount: 4,
    });
    await selectProposalTab(page, "Proposed");
    await expect(proposalCardsWithPrefix(page, firstSeriesTitle)).toHaveCount(4, {
      timeout: 20_000,
    });

    await logout(page);

    // —— Phase 2: admin pauses bad_user ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await pauseUserInAdmin(page, USERS.badUser.displayName);

    await logout(page);

    // —— Phase 3: paused bad_user lands on /paused, not the app ——
    await login(page, USERS.badUser.username);
    await expect(page).toHaveURL(/\/paused/);
    await expect(page.getByText(/account has been paused/i)).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);

    await logout(page);

    // —— Phase 4: admin unpauses bad_user ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await resumeUserInAdmin(page, USERS.badUser.displayName);

    await logout(page);

    // —— Phase 5: bad_user schedules another 4-week recurring series ——
    await login(page, USERS.badUser.username);
    await goToProposals(page);
    await createAndSubmitRecurringEventForEveryone(page, {
      title: secondSeriesTitle,
      start: "2099-12-01T18:00",
      end: "2099-12-01T20:00",
      occurrenceCount: 4,
    });
    await selectProposalTab(page, "Proposed");
    await expect(proposalCardsWithPrefix(page, secondSeriesTitle)).toHaveCount(4, {
      timeout: 20_000,
    });

    await logout(page);

    // —— Phase 6: admin deletes bad_user ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await deleteUserInAdmin(page, USERS.badUser.displayName);
    await expect(page.getByText(/Deleted Bad User/i)).toBeVisible({ timeout: 15_000 });

    await logout(page);

    // —— Phase 7: deleted bad_user cannot sign in ——
    await expectLoginRejected(page, USERS.badUser.username);

    // —— Phase 8: admin sees deleted status and removed artifacts ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "User management");
    const formerUserRow = page.getByRole("row").filter({ hasText: "Former User" });
    await expect(formerUserRow.getByText("deleted", { exact: true })).toBeVisible();

    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await expect(proposalCardsWithPrefix(page, firstSeriesTitle)).toHaveCount(0);
    await expect(proposalCardsWithPrefix(page, secondSeriesTitle)).toHaveCount(0);

    await goToPeoplePlaces(page);
    await expect(page.getByText(placeName)).toHaveCount(0);
  });
});
