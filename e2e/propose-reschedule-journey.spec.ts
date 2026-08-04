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
});
