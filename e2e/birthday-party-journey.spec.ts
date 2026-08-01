import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import {
  acceptProposalWithComment,
  openEventProposalDraft,
  proposalCard,
  setInviteeRequired,
  submitProposalDraft,
} from "./helpers/proposals";

const REQUIRED_INVITEES = [
  USERS.leia,
  USERS.han,
  USERS.chewie,
  USERS.anakin,
  USERS.yoda,
  USERS.vader,
  USERS.lando,
] as const;

test.describe("Birthday party journey", () => {
  test("Luke invites everyone to a 4-hour party; all required invitees accept", async ({ page }) => {
    test.setTimeout(600_000);

    const partyTitle = `Luke's birthday ${Date.now()}`;

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);

    const draft = await openEventProposalDraft(page);
    await draft.getByLabel("Title").fill(partyTitle);
    await draft.getByRole("button", { name: "With invitees" }).click();
    for (const invitee of REQUIRED_INVITEES) {
      await setInviteeRequired(draft, invitee.displayName);
    }
    await fillProposalDateTimeField(draft.getByLabel("Start").first(), "2099-12-01T14:00");
    await fillProposalDateTimeField(draft.getByLabel("End (optional)").first(), "2099-12-01T18:00");
    await draft.getByRole("button", { name: "Save", exact: true }).click();
    await submitProposalDraft(page, draft);
    await logout(page);

    for (const invitee of REQUIRED_INVITEES) {
      await loginWithOnboardingIfNeeded(page, invitee.username);
      await goToProposals(page);
      await selectProposalTab(page, "Proposed");
      await openProposalCard(page, partyTitle);
      await acceptProposalWithComment(page, `Count me in — ${invitee.displayName}`);
      await logout(page);
    }

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, partyTitle)).toBeVisible({ timeout: 25_000 });
  });
});
