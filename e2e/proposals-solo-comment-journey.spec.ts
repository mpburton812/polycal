import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { clickCommentPost, createAndSubmitSoloEvent, proposalCard } from "./helpers/proposals";

test.describe("Solo open event network comment journey", () => {
  test("network member without sleeping tie can comment on resolved solo event", async ({ page }) => {
    test.setTimeout(180_000);

    const tag = Date.now();
    const title = `E2E Alone Time ${tag}`;
    const comment = "I hope you have a nice time!";
    const start = "2099-09-10T14:00";
    const end = "2099-09-10T16:30";

    await login(page, USERS.luke.username);
    await page.getByRole("link", { name: "Proposals" }).click();
    await createAndSubmitSoloEvent(page, {
      title,
      notes: "Alone Time",
      start,
      end,
    });

    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, title)).toBeVisible({ timeout: 20_000 });

    await logout(page);
    await login(page, USERS.han.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, title);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog.getByPlaceholder("Add a comment…")).toBeVisible();
    await dialog.getByPlaceholder("Add a comment…").fill(comment);
    await clickCommentPost(dialog);
    await expect(dialog.getByText(comment)).toBeVisible({ timeout: 15_000 });
  });
});
