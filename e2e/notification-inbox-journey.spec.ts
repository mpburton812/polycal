import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProposals } from "./helpers/navigation";
import {
  acceptFromInbox,
  dismissNotification,
  openNotificationInbox,
} from "./helpers/notifications";
import {
  openEventProposalDraft,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";
import { fillProposalDateTimeField } from "./helpers/datePickers";

test.describe("Notification inbox journey", () => {
  test("accept, dismiss, and clear-all from the header inbox", async ({ page }) => {
    test.setTimeout(240_000);

    const tag = Date.now();
    const eventTitle = `E2E Inbox Event ${tag}`;
    const start = "2099-12-05T18:00";

    await login(page, USERS.luke.username);
    await goToProposals(page);
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(eventTitle);
    await setInviteeRequired(dialog, USERS.leia.displayName);
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), start);
    await dialog.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialog);

    await logout(page);
    await login(page, USERS.leia.username);
    await page.reload();
    await openNotificationInbox(page);
    await expect(page.getByText(eventTitle).first()).toBeVisible({ timeout: 15_000 });
    await acceptFromInbox(page, eventTitle);
    await expect(page.getByText(/Vote recorded/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("li").filter({ hasText: eventTitle })).toHaveCount(0);
    await page.getByRole("button", { name: "Close notifications" }).click();

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    const dialogB = await openEventProposalDraft(page);
    const eventB = `E2E Inbox B ${tag}`;
    await dialogB.getByLabel("Title").fill(eventB);
    await setInviteeRequired(dialogB, USERS.leia.displayName);
    await fillProposalDateTimeField(dialogB.getByLabel("Start").first(), "2099-12-06T18:00");
    await dialogB.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialogB);

    await logout(page);
    await login(page, USERS.leia.username);
    await page.reload();
    await openNotificationInbox(page);
    await expect(page.getByText(eventB).first()).toBeVisible({ timeout: 15_000 });
    await dismissNotification(page, eventB);
    await expect(page.locator("li").filter({ hasText: eventB })).toHaveCount(0);
    await page.getByRole("button", { name: "Close notifications" }).click();

    await logout(page);
    await login(page, USERS.han.username);
    await goToProposals(page);
    const dialogC = await openEventProposalDraft(page);
    const eventC = `E2E Inbox C ${tag}`;
    await dialogC.getByLabel("Title").fill(eventC);
    await setInviteeRequired(dialogC, USERS.leia.displayName);
    await fillProposalDateTimeField(dialogC.getByLabel("Start").first(), "2099-12-07T18:00");
    await dialogC.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialogC);

    await logout(page);
    await login(page, USERS.leia.username);
    await page.reload();
    await openNotificationInbox(page);
    await expect(page.getByText(eventC).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByTestId("notifications-empty")).toBeVisible({ timeout: 15_000 });
  });
});
