import { expect, test } from "./helpers/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  goToAdmin,
  goToFeed,
  goToProposals,
  goToSchedule,
  selectProposalTab,
} from "./helpers/navigation";
import { expandAdminSection } from "./helpers/admin";
import { dateOffsetIso } from "./helpers/schedule";
import { batchNightSection } from "./helpers/proposals";

/**
 * FastSleep user journey (PC-381): auto-confirm nights for self + partner
 * arrangements, one feed Auto-confirmed card, schedule visibility, admin toggle.
 */
test.describe("FastSleep journey", () => {
  test("auto-confirms nights, one feed card, schedule, and toggle off", async ({ page }) => {
    test.setTimeout(300_000);

    const nightSelf = dateOffsetIso(1);
    const nightPair = dateOffsetIso(2);
    const nightPartnerSolo = dateOffsetIso(3);

    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);

    await page.locator(".MuiFab-root").first().click();
    await page.getByTestId("fab-fast-sleep").click();

    const dialog = page.getByTestId("fast-sleep-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId("fast-sleeping-plan-grid")).toBeVisible();

    {
      const section = batchNightSection(dialog, nightSelf);
      await expect(section).toBeVisible({ timeout: 10_000 });
      await section.getByLabel("Subject").click();
      await page.getByRole("option", { name: USERS.han.displayName }).click();
      await section.getByRole("button", { name: "Solo", exact: true }).click();
    }

    {
      const section = batchNightSection(dialog, nightPair);
      await section.getByLabel("Subject").click();
      await page.getByRole("option", { name: USERS.han.displayName }).click();
      await section.getByRole("button", { name: "Partners", exact: true }).click();
      const leiaChip = section.getByRole("button", { name: USERS.leia.displayName, exact: true });
      await expect(leiaChip).toBeVisible({ timeout: 10_000 });
      await leiaChip.click();
    }

    {
      const section = batchNightSection(dialog, nightPartnerSolo);
      await section.getByLabel("Subject").click();
      await page.getByRole("option", { name: USERS.leia.displayName }).click();
      await section.getByRole("button", { name: "Solo", exact: true }).click();
    }

    await dialog.getByTestId("fast-sleep-submit").click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    await selectProposalTab(page, "Resolved");
    await expect(page.getByText(/Sleeping:/i).first()).toBeVisible({ timeout: 20_000 });

    await goToFeed(page);
    const autoConfirmed = page.getByTestId("feed-milestone-card").filter({
      hasText: /Auto-confirmed/i,
    });
    await expect(autoConfirmed).toHaveCount(1, { timeout: 20_000 });

    await goToSchedule(page);
    await expect(page.getByText(/Sleeping:/i).first()).toBeVisible({ timeout: 20_000 });

    await logout(page);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToAdmin(page);
    await expandAdminSection(page, "Poly group settings");
    const toggle = page.getByLabel("Enable FastSleep");
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    if (await toggle.isChecked()) {
      await toggle.click();
    }
    await page.getByRole("button", { name: /Save settings/i }).click();
    await expect(page.getByText(/saved|updated/i).first()).toBeVisible({ timeout: 15_000 });

    await logout(page);
    await loginWithOnboardingIfNeeded(page, USERS.han.username);
    await goToProposals(page);
    await page.locator(".MuiFab-root").first().click();
    await expect(page.getByTestId("fab-fast-sleep")).toHaveCount(0);
  });
});
