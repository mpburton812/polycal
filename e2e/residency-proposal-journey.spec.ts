import { expect, test } from "./helpers/test";

import { expandAdminSection } from "./helpers/admin";
import { login, loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToAdmin, goToPeoplePlaces, goToProposals, selectProposalTab } from "./helpers/navigation";
import { expectInAppNotification } from "./helpers/notifications";
import { associateResident, expandPlace } from "./helpers/people-places";
import { proposalCard } from "./helpers/proposals";

const PLACE = "Cloud City";
const RESIDENCY_TITLE = `Residency at ${PLACE}`;

test.describe("Residency proposal journey", () => {
  test("admin assigns residency, invitee responds, ownership edit flow", async ({ page }) => {
    test.setTimeout(300_000);

    // —— Phase 1: Luke assigns Leia residency at Cloud City ——
    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);
    await associateResident(page, PLACE, USERS.leia.displayName);
    await logout(page);

    // —— Phase 2: Leia notified, declines via Proposals ——
    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await expectInAppNotification(page, new RegExp(PLACE, "i"));
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, RESIDENCY_TITLE)).toBeVisible({ timeout: 20_000 });
    await proposalCard(page, RESIDENCY_TITLE).click();
    const leiaDialog = page.getByRole("dialog");
    await leiaDialog.getByRole("button", { name: "Decline" }).click();
    await logout(page);

    // —— Phase 3: Luke sees declined draft, deletes it ——
    await login(page, USERS.luke.username);
    await expectInAppNotification(page, /declined residency/i);
    await goToProposals(page);
    await selectProposalTab(page, "Drafts");
    await expect(proposalCard(page, RESIDENCY_TITLE)).toBeVisible({ timeout: 20_000 });
    await proposalCard(page, RESIDENCY_TITLE).click();
    const lukeDraftDialog = page.getByRole("dialog");
    await lukeDraftDialog.getByRole("button", { name: "Delete draft" }).click();
    await expect(proposalCard(page, RESIDENCY_TITLE)).toHaveCount(0, { timeout: 15_000 });
    await logout(page);

    // —— Phase 4: Luke assigns Han, Han accepts with comment ——
    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);
    await associateResident(page, PLACE, USERS.han.displayName);
    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await expectInAppNotification(page, new RegExp(PLACE, "i"));
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await proposalCard(page, RESIDENCY_TITLE).click();
    const hanDialog = page.getByRole("dialog");
    const comment = "this is great";
    await hanDialog.getByPlaceholder("Add a comment…").fill(comment);
    await hanDialog.getByRole("button", { name: "Post" }).click();
    await expect(hanDialog.getByText(comment)).toBeVisible({ timeout: 15_000 });
    await hanDialog.getByRole("button", { name: "Accept" }).click();

    // —— Phase 5: Han edits place bedrooms as accepted resident ——
    await goToPeoplePlaces(page);
    await expandPlace(page, PLACE);
    await page.getByRole("button", { name: "Edit place" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit place" });
    await editDialog.getByLabel("Bedrooms").fill("2");
    await editDialog.getByLabel("Bedroom 1 name").fill("bedroom happy");
    await editDialog.getByLabel("Bedroom 2 name").fill("bedroom sad");
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("bedroom happy")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("bedroom sad")).toBeVisible();
    await logout(page);

    // —— Phase 6: Admin activity log contains residency actions ——
    await login(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "System administrator log");
    await expect(page.getByText("places.propose_residency").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("places.decline_residency").first()).toBeVisible();
    await expect(page.getByText("places.accept_residency").first()).toBeVisible();
    await expect(page.getByRole("table")).toContainText(USERS.leia.displayName);
    await expect(page.getByRole("table")).toContainText(USERS.han.displayName);
  });
});
