import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import {
  goToProposals,
  openProposalCard,
  selectProposalTab,
} from "./helpers/navigation";
import {
  openEventProposalDraft,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

test.describe("In-flight overlap and revoke acceptance", () => {
  test("overlap warning after vote, acknowledge, then revoke acceptance flags at-risk", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    const tag = Date.now();
    const eventA = `E2E Overlap A ${tag}`;
    const eventB = `E2E Overlap B ${tag}`;
    const slotStart = "2099-11-10T14:00";
    const slotEnd = "2099-11-10T16:00";
    const overlapStart = "2099-11-10T15:00";

    await login(page, USERS.luke.username);
    await goToProposals(page);
    const dialogA = await openEventProposalDraft(page);
    await dialogA.getByLabel("Title").fill(eventA);
    await setInviteeRequired(dialogA, USERS.leia.displayName);
    await fillProposalDateTimeField(dialogA.getByLabel("Start").first(), slotStart);
    await fillProposalDateTimeField(dialogA.getByLabel("End (optional)").first(), slotEnd);
    await dialogA.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialogA);

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, eventA);
    const leiaDialog = page.getByRole("dialog");
    await leiaDialog.getByRole("button", { name: "Accept" }).click();
    await expectToast(page, /Vote recorded/i);
    await expect(leiaDialog.getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await leiaDialog.getByRole("button", { name: "Close" }).click();

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    const dialogB = await openEventProposalDraft(page);
    await dialogB.getByLabel("Title").fill(eventB);
    await setInviteeRequired(dialogB, USERS.leia.displayName);
    await fillProposalDateTimeField(dialogB.getByLabel("Start").first(), overlapStart);
    await fillProposalDateTimeField(
      dialogB.getByLabel("End (optional)").first(),
      "2099-11-10T17:00",
    );
    await dialogB.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialogB);

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, eventB);
    const eventBDialog = page.getByRole("dialog");
    await eventBDialog.getByRole("button", { name: "Accept" }).click();
    await expectToast(page, /Vote recorded/i);
    await eventBDialog.getByRole("button", { name: "Close" }).click();

    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, eventA);
    const overlapDialog = page.getByRole("dialog");
    await expect(
      overlapDialog.getByText(/Your calendar now conflicts with this event after you voted/i),
    ).toBeVisible({ timeout: 15_000 });

    await overlapDialog.getByRole("button", { name: "Acknowledge" }).click();
    await expectToast(page, /Overlap acknowledged/i);
    await expect(
      overlapDialog.getByText(/Your calendar now conflicts with this event after you voted/i),
    ).toHaveCount(0);

    await expect(overlapDialog.getByRole("button", { name: "Revoke acceptance" })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await overlapDialog.getByRole("button", { name: "Revoke acceptance" }).click();
    await expectToast(page, /flagged at risk/i);

    await overlapDialog.getByRole("button", { name: "Close" }).click();
    await selectProposalTab(page, "Proposed");
    const atRiskCard = page.locator(".MuiCard-root").filter({
      has: page.getByRole("heading", { name: eventA, level: 2 }),
    });
    await expect(atRiskCard.getByText("At risk")).toBeVisible({ timeout: 15_000 });
  });
});
