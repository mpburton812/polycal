import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { advanceScheduleUntilEventVisible, clearScheduleViewState, dateOffsetIso } from "./helpers/schedule";
import { createAndSubmitRecurringEventForEveryone } from "./helpers/proposals";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Recurrence slice chooser journey", () => {
  test.beforeEach(async ({ page }) => {
    await clearScheduleViewState(page);
  });
  test("schedule tap offers occurrence vs series chooser", async ({ page }) => {
    test.setTimeout(240_000);

    const title = `E2E Recurrence Slice ${Date.now()}`;
    const start = `${dateOffsetIso(35)}T18:00`;
    const end = `${dateOffsetIso(35)}T20:00`;

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    await createAndSubmitRecurringEventForEveryone(page, {
      title,
      start,
      end,
      occurrenceCount: 3,
    });

    await selectProposalTab(page, "Proposed");
    await expect(page.getByRole("heading", { name: new RegExp(title, "i"), level: 2 }).first()).toBeVisible({
      timeout: 20_000,
    });

    await advanceScheduleUntilEventVisible(page, new RegExp(title, "i"), {
      targetDateIso: dateOffsetIso(35),
    });
    await page.getByRole("button", { name: new RegExp(title, "i") }).first().click();

    await expect(page.getByRole("dialog").getByText("Recurring event")).toBeVisible();
    await page.getByRole("button", { name: "This occurrence" }).click();
    await expect(page.getByRole("dialog").getByText(/PROPOSED BY/i)).toBeVisible();
  });
});
