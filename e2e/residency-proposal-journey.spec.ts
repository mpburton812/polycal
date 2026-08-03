import { expect, test } from "./helpers/test";

import { expandAdminSection } from "./helpers/admin";
import { login, loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { dismissBlockingDialogsIfOpen } from "./helpers/motd";
import { goToAdmin, goToPeoplePlaces, goToProposals, selectProposalTab } from "./helpers/navigation";
import { expectInAppNotification } from "./helpers/notifications";
import { addPersonToPlace, expandPlace } from "./helpers/people-places";
import { proposalCard } from "./helpers/proposals";

const PLACE = "Cloud City";
const RESIDENCY_TITLE = `Residency at ${PLACE}`;

test.describe("Residency proposal journey", () => {
  test("owner adds resident immediately; self-join requires owner approval", async ({ page }) => {
    test.setTimeout(300_000);

    // —— Phase 1: Luke (owner/admin) adds Han as Resident immediately ——
    await login(page, USERS.luke.username);
    await goToPeoplePlaces(page);
    await addPersonToPlace(page, PLACE, USERS.han.displayName, "Resident");
    await expandPlace(page, PLACE);
    await expect(page.getByText(USERS.han.displayName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await logout(page);

    // —— Phase 2: Han is notified and can edit the place as resident ——
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await dismissBlockingDialogsIfOpen(page);
    await expectInAppNotification(page, new RegExp(PLACE, "i"));
    await goToPeoplePlaces(page);
    await dismissBlockingDialogsIfOpen(page);
    await expandPlace(page, PLACE);
    await page.getByRole("button", { name: "Edit place" }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit place" });
    await editDialog.getByLabel("Bedrooms").fill("2");
    await editDialog.getByLabel("Bedroom 1 name").fill("bedroom happy");
    await editDialog.getByLabel("Bedroom 2 name").fill("bedroom sad");
    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(editDialog).toBeHidden({ timeout: 15_000 });
    // router.refresh remounts collapsible places collapsed — re-expand before asserting.
    await expandPlace(page, PLACE);
    await expect(page.getByText("bedroom happy")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("bedroom sad")).toBeVisible();
    await logout(page);

    // —— Phase 3: Leia self-joins via residency proposal (owners approve) ——
    await loginWithOnboardingIfNeeded(page, USERS.leia.username);
    await goToProposals(page);
    await page.getByRole("button", { name: "New proposal" }).click();
    await page.getByRole("menuitem", { name: "Residency Proposal" }).click();
    const residencyDialog = page.getByRole("dialog", { name: "Residency Proposal" });
    await residencyDialog.getByLabel("Place").click();
    await page.getByRole("option", { name: PLACE }).click();
    await expect(residencyDialog.getByText(/Owners:/i)).toBeVisible();
    await expect(residencyDialog.getByText(/Luke/i)).toBeVisible();
    await residencyDialog.getByLabel("Access level").click();
    await page.getByRole("option", { name: "Resident" }).click();
    await residencyDialog.getByRole("button", { name: "Submit" }).click();
    await expect(residencyDialog).toBeHidden({ timeout: 20_000 });
    await logout(page);

    // —— Phase 4: Luke (owner) accepts Leia's self-join ——
    await login(page, USERS.luke.username);
    await expectInAppNotification(page, /Residency|Cloud City/i);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await expect(proposalCard(page, RESIDENCY_TITLE)).toBeVisible({ timeout: 20_000 });
    await proposalCard(page, RESIDENCY_TITLE).click();
    const lukeDialog = page.getByRole("dialog");
    await lukeDialog.getByRole("button", { name: "Accept" }).click();
    await lukeDialog.getByRole("button", { name: "Close" }).click({ timeout: 15_000 });

    await goToPeoplePlaces(page);
    await expandPlace(page, PLACE);
    await expect(page.getByText(USERS.leia.displayName)).toBeVisible({ timeout: 15_000 });

    // —— Phase 5: Admin activity log (human-readable action labels, PC-245) ——
    await goToAdmin(page);
    await expandAdminSection(page, "System administrator log");
    await expect(page.getByText("Added person to place").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Proposed residency").first()).toBeVisible();
    await expect(page.getByText("Accepted residency").first()).toBeVisible();
  });
});
