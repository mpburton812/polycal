import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { createAndSubmitSoloAllDayEvent } from "./helpers/proposals";
import {
  advanceScheduleUntilEventVisible,
  createAndSubmitAllDaySpan,
  dateOffsetIso,
} from "./helpers/schedule";
import { goToProposals, selectProposalTab } from "./helpers/navigation";

test.describe("Multi-day event slice journey", () => {
  test("resolved all-day span day opens slice detail on schedule", async ({ page }) => {
    test.setTimeout(240_000);

    const title = `E2E All-day Slice ${Date.now()}`;
    const startDate = dateOffsetIso(30);
    const endDate = dateOffsetIso(32);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    await createAndSubmitAllDaySpan(page, { title, startDate, endDate });

    await selectProposalTab(page, "Resolved");
    await expect(page.getByRole("heading", { name: new RegExp(title, "i"), level: 2 }).first()).toBeVisible({
      timeout: 20_000,
    });

    await advanceScheduleUntilEventVisible(page, new RegExp(title, "i"), {
      targetDateIso: startDate,
    });

    await page.getByRole("button", { name: new RegExp(title, "i") }).first().click();

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "This day" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Open parent" })).toBeVisible();
  });

  test("resolved single-day all-day opens parent detail not slice (PC-301)", async ({ page }) => {
    test.setTimeout(240_000);

    const title = `E2E All-day Single ${Date.now()}`;
    const day = dateOffsetIso(28);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    await createAndSubmitSoloAllDayEvent(page, {
      title,
      comment: "single day poke",
      day,
    });

    await selectProposalTab(page, "Resolved");
    await expect(page.getByRole("heading", { name: new RegExp(title, "i"), level: 2 }).first()).toBeVisible({
      timeout: 20_000,
    });

    await advanceScheduleUntilEventVisible(page, new RegExp(title, "i"), {
      targetDateIso: day,
    });

    await page.getByRole("button", { name: new RegExp(title, "i") }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "This day" })).toHaveCount(0);
    await expect(dialog.getByText(title).first()).toBeVisible({ timeout: 15_000 });
  });
});
