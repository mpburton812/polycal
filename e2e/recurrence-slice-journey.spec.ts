import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { advanceScheduleUntilEventVisible, dateOffsetIso } from "./helpers/schedule";
import { createAndSubmitRecurringEventForEveryone } from "./helpers/proposals";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Recurrence schedule open journey", () => {
  test("schedule tap opens occurrence detail directly", async ({ page }) => {
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

    // PC-166: skip chooser — open the occurrence detail immediately.
    await expect(page.getByRole("dialog").getByRole("heading", { name: new RegExp(title, "i") })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("dialog").getByText(/by [A-Za-z]/)).toBeVisible();
  });
});
