import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { advanceScheduleUntilEventVisible, dateOffsetIso } from "./helpers/schedule";
import { createAndSubmitSoloSleepingWeek } from "./helpers/proposals";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Batch sleeping journey", () => {
  test("solo batch week resolves, slice view opens from schedule, parent link works", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    const rangeStart = dateOffsetIso(21);
    const rangeEnd = dateOffsetIso(27);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    const nightCount = await createAndSubmitSoloSleepingWeek(page, {
      rangeStart,
      rangeEnd,
    });

    expect(nightCount).toBeGreaterThan(0);

    await selectProposalTab(page, "Resolved");
    await expect(page.getByText(/Sleeping:/i).first()).toBeVisible({ timeout: 15_000 });

    await advanceScheduleUntilEventVisible(page, /Sleeping:/i);
    await page.getByRole("button", { name: /Sleeping:/i }).first().click();

    await expect(page.getByRole("dialog").getByText("This night")).toBeVisible();
    await page.getByRole("button", { name: /View full series/i }).click();
    await expect(page.getByRole("dialog").getByText(/PROPOSED BY/i)).toBeVisible();
  });
});
