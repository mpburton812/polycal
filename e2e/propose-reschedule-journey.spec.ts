import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { createAndSubmitTimedEventWithInvitee } from "./helpers/proposals";

/**
 * A proposes a required timed event to B; B must not see Reschedule / Re-draft (PC-415).
 */
test.describe("Propose then invitee cannot reschedule journey", () => {
  test("invitee sees Accept but not Reschedule or Re-draft", async ({ page }) => {
    const title = `E2E Reschedule Gate ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: "Required invitee must not see Reschedule.",
      inviteeName: USERS.leia.displayName,
      inviteeRole: "required",
      start: "2099-08-15T15:00",
      end: "2099-08-15T16:00",
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Accept" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Re-draft" })).toHaveCount(0);
  });

  test("resolved event shows Cancel Event and hides Reschedule and Delete proposal", async ({
    page,
  }) => {
    const title = `E2E Resolved Actions ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: "Resolved actions should drop Reschedule and Delete.",
      inviteeName: USERS.leia.displayName,
      inviteeRole: "required",
      start: "2099-08-16T15:00",
      end: "2099-08-16T16:00",
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await selectProposalTab(page, "Proposed");
    await openProposalCard(page, title);
    await page.getByRole("dialog").getByRole("button", { name: "Accept" }).click();
    await expect(page.getByRole("dialog").getByText("RESOLVED", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
    await logout(page);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, title);
    const resolved = page.getByRole("dialog");
    await expect(resolved.getByRole("button", { name: "Cancel Event" })).toBeVisible();
    await expect(resolved.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
    await expect(resolved.getByRole("button", { name: "Delete proposal" })).toHaveCount(0);
  });
});
