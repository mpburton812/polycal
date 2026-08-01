import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  advanceScheduleUntilEventVisible,
  dateOffsetIso,
} from "./helpers/schedule";
import { createAndSubmitSoloSleepingWeek } from "./helpers/proposals";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Batch sleeping slice journey", () => {
  test("resolved batch night opens slice detail on schedule", async ({ page }) => {
    test.setTimeout(240_000);

    const rangeStart = dateOffsetIso(1);
    const rangeEnd = dateOffsetIso(7);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    const nightCount = await createAndSubmitSoloSleepingWeek(page, {
      rangeStart,
      rangeEnd,
    });

    expect(nightCount).toBeGreaterThan(0);

    await selectProposalTab(page, "Resolved");
    await expect(page.getByText(/Sleeping: Han Solo(?!, Confirmed)/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await advanceScheduleUntilEventVisible(
      page,
      /Sleeping: Han Solo/i,
      { targetDateIso: rangeStart },
    );

    await page
      .getByRole("button", { name: /Sleeping: Han Solo/i })
      .first()
      .click();

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "This night" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open parent" })).toBeVisible();
  });
});
