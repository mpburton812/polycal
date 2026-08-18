import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateRange, fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import {
  openEventProposalDraft,
  openSleepingProposalDraft,
  setInviteeRequired,
  sleepingProposalCardsFor,
  submitProposalDraft,
} from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

test.describe("Sleeping vs events — no false conflicts", () => {
  test("solo sleeping night does not block overlapping event submit", async ({ page }) => {
    test.setTimeout(180_000);

    const nightDate = "2099-09-15";
    const eventStart = "2099-09-15T20:00";
    const eventTitle = `E2E Same-night event ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToProposals(page);

    const sleepingDialog = await openSleepingProposalDraft(page);
    await sleepingDialog.getByLabel("Title").fill(`E2E sleeping ${Date.now()}`);
    await fillProposalDateRange(sleepingDialog, nightDate);
    await sleepingDialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
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

  test("cancel solo sleeping then resubmit same night without false conflict (PC-373)", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const nightDate = "2099-09-22";

    await login(page, USERS.luke.username);
    await goToProposals(page);

    const first = await openSleepingProposalDraft(page);
    await first.getByLabel("Title").fill(`E2E sleeping cancel ${Date.now()}`);
    await fillProposalDateRange(first, nightDate);
    await first.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await submitProposalDraft(page, first);

    await selectProposalTab(page, "Resolved");
    const card = sleepingProposalCardsFor(page, USERS.luke.displayName).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    const cancelledTitle = await card.getByRole("heading", { level: 2 }).innerText();

    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("heading", { level: 2 }).click();
    const detail = page.getByRole("dialog");
    await detail.getByRole("button", { name: "Cancel Event", exact: true }).click();
    await expect(detail).toBeHidden({ timeout: 15_000 });

    await selectProposalTab(page, "Archived");
    await expect(page.getByRole("heading", { name: cancelledTitle, level: 2 })).toBeVisible({
      timeout: 15_000,
    });

    const second = await openSleepingProposalDraft(page);
    await second.getByLabel("Title").fill(`E2E sleeping resubmit ${Date.now()}`);
    await fillProposalDateRange(second, nightDate);
    await second.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await second.getByRole("button", { name: "Submit" }).click();

    const conflictDialog = page.getByRole("dialog", { name: "Schedule conflicts detected" });
    await expect(conflictDialog).toHaveCount(0);

    await expectToast(page, /submitted|scheduled|resolved|created/i);

    await selectProposalTab(page, "Resolved");
    await expect(sleepingProposalCardsFor(page, USERS.luke.displayName).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
