import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateRange, fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import {
  openEventProposalDraft,
  openSleepingProposalDraft,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";

test.describe("Sleeping vs events — no false conflicts", () => {
  test("solo sleeping night does not block overlapping event submit", async ({ page }) => {
    test.setTimeout(180_000);

    const nightDate = "2099-09-15";
    const eventStart = "2099-09-15T20:00";
    const eventTitle = `E2E Same-night event ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToProposals(page);

    const sleepingDialog = await openSleepingProposalDraft(page);
    await fillProposalDateRange(sleepingDialog, nightDate);
    await sleepingDialog.getByRole("button", { name: "Solo", exact: true }).first().click();
    await submitProposalDraft(page, sleepingDialog);

    const eventDialog = await openEventProposalDraft(page);
    await eventDialog.getByLabel("Title").fill(eventTitle);
    await setInviteeRequired(eventDialog, USERS.leia.displayName);
    await fillProposalDateTimeField(eventDialog.getByLabel("Start").first(), eventStart);
    await submitProposalDraft(page, eventDialog);

    await selectProposalTab(page, "Proposed");
    await expect(page.getByRole("heading", { name: eventTitle, level: 2 })).toBeVisible({
      timeout: 20_000,
    });
  });
});
