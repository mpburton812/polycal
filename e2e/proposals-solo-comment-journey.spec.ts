import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { currentWeekDateTime } from "./helpers/datePickers";
import { goToProposals, goToSchedule, selectProposalTab } from "./helpers/navigation";
import { createAndSubmitSoloEvent, proposalCard } from "./helpers/proposals";

test.describe("Solo open event network comment journey", () => {
  test("network member without sleeping tie can comment on resolved solo event", async ({ page }) => {
    test.setTimeout(180_000);

    const tag = Date.now();
    const title = `E2E Alone Time ${tag}`;
    const comment = "I hope you have a nice time!";
    const start = currentWeekDateTime(3, 14, 0);
    const end = currentWeekDateTime(3, 16, 30);

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
    await goToSchedule(page);
    await page.getByRole("button", { name: new RegExp(title, "i") }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
    await expect(dialog.getByPlaceholder("Add a comment…")).toBeVisible();
    await dialog.getByPlaceholder("Add a comment…").fill(comment);
    await dialog.getByRole("button", { name: "Post" }).click();
    await expect(dialog.getByText(comment)).toBeVisible({ timeout: 15_000 });
  });
});
