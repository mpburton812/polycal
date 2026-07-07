import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  advanceScheduleUntilEventVisible,
  createAndSubmitAllDaySpan,
  dateOffsetIso,
} from "./helpers/schedule";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Multi-day event slice journey", () => {
  test("all-day span opens per-day slice detail from schedule", async ({ page }) => {
    test.setTimeout(180_000);

    const title = `E2E All-day Slice ${Date.now()}`;
    const startDate = dateOffsetIso(30);
    const endDate = dateOffsetIso(32);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    await createAndSubmitAllDaySpan(page, { title, startDate, endDate });

    await selectProposalTab(page, "Resolved");
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible({
      timeout: 15_000,
    });

    await advanceScheduleUntilEventVisible(page, new RegExp(title, "i"), {
      targetDateIso: startDate,
    });
    await page.getByRole("button", { name: new RegExp(title, "i") }).first().click();

    await expect(page.getByRole("dialog").getByText("This day")).toBeVisible();
    await page.getByRole("button", { name: /View full series/i }).click();
    await expect(page.getByRole("dialog").getByText(title)).toBeVisible();
  });
});
