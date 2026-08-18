import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { BT_PLACES, BT_USERS, BURTON_THOMPSON_PASSWORD } from "./helpers/burton-thompson";
import { goToProposals, selectProposalTab } from "./helpers/navigation";
import { dateOffsetIso } from "./helpers/schedule";
import {
  configureBatchNight,
  openNewProposalFabMenu,
  proposalCard,
} from "./helpers/proposals";

test.describe("Batch sleeping partners journey", () => {
  test("Katie bulk-books mixed solo and partner nights that auto-resolve", async ({ page }) => {
    test.setTimeout(360_000);

    const night0 = dateOffsetIso(2);
    const night1 = dateOffsetIso(3);
    const night2 = dateOffsetIso(4);
    const night3 = dateOffsetIso(5);

    const sleepingTitle = new RegExp(
      `Sleeping:.*${BT_USERS.katie.displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );

    await loginWithOnboardingIfNeeded(
      page,
      BT_USERS.katie.username,
      BURTON_THOMPSON_PASSWORD,
    );
    await goToProposals(page);

    await openNewProposalFabMenu(page);
    await page.getByTestId("fab-fast-sleep").click();
    const dialog = page.getByTestId("fast-sleep-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible({ timeout: 15_000 });

    await configureBatchNight(dialog, page, night0, {
      nightDate: night0,
      mode: "solo",
      locationName: BT_PLACES.katiesPlace,
    });
    await configureBatchNight(dialog, page, night1, {
      nightDate: night1,
      mode: "solo",
      customLocation: BT_PLACES.michaelsPlace,
    });
    await configureBatchNight(dialog, page, night2, {
      nightDate: night2,
      mode: "withInvitees",
      requiredInvitees: [BT_USERS.michael.displayName],
      locationName: BT_PLACES.katiesPlace,
    });
    await configureBatchNight(dialog, page, night3, {
      nightDate: night3,
      mode: "withInvitees",
      requiredInvitees: [BT_USERS.michael.displayName],
      locationName: BT_PLACES.michaelsPlace,
    });

    await dialog.getByTestId("fast-sleep-submit").click();
    if (await dialog.getByText(/Submit again/i).isVisible().catch(() => false)) {
      await dialog.getByTestId("fast-sleep-submit").click();
    }
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    await selectProposalTab(page, "Resolved");
    await expect(proposalCard(page, sleepingTitle)).toBeVisible({ timeout: 25_000 });
    await logout(page);
  });
});
