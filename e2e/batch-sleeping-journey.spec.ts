import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { createAndSubmitSoloSleepingWeek } from "./helpers/proposals";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Batch sleeping journey", () => {
  test("solo batch week resolves and appears on schedule", async ({ page }) => {
    test.setTimeout(240_000);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    const nightCount = await createAndSubmitSoloSleepingWeek(page, {
      titlePrefix: `Batch week ${Date.now()}`,
      rangeStart: "2099-08-04",
      rangeEnd: "2099-08-10",
    });

    expect(nightCount).toBeGreaterThan(0);

    await selectProposalTab(page, "Resolved");
    await expect(page.getByText(/Batch week/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
