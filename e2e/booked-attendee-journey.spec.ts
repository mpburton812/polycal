import { expect, test } from "./helpers/test";
import type { Page } from "@playwright/test";

import { login, loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { DEMO, USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { expandAdminSection } from "./helpers/admin";
import { goToAdmin, goToFeed, goToProposals, openProposalCard, selectProposalTab } from "./helpers/navigation";
import { inboxRow, openNotificationInbox } from "./helpers/notifications";
import {
  openEventProposalDraft,
  submitProposalDraft,
} from "./helpers/proposals";
import { activeMainPanel } from "./helpers/tab-swipe";

/**
 * Booked attendees on resolved events and Post to Feed (PC-430 / PC-431).
 */
test.describe("Booked attendee and Post to Feed journeys", () => {
  test("adds a Booked person on a resolved dual-mode event and notifies them", async ({ page }) => {
    test.setTimeout(300_000);
    const title = `E2E Booked ${Date.now()}`;

    try {
      await setPostingMode(page, "Proposals and Bookings");
      await loginWithOnboardingIfNeeded(page, USERS.luke.username);
      await goToProposals(page);

      const dialog = await openEventProposalDraft(page);
      await dialog.getByRole("button", { name: "Booking", exact: true }).click();
      await dialog.getByLabel("Title").fill(title);
      await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-12-10T11:00");
      await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
      await submitProposalDraft(page, dialog);

      await selectProposalTab(page, "Resolved");
      await openProposalCard(page, title);
      const detail = page.getByRole("dialog");
      await expect(detail.getByLabel("Role")).toBeVisible();
      await detail.getByLabel("Add attendee").click();
      await page.getByRole("option", { name: USERS.han.displayName }).click();
      await detail.getByLabel("Role").click();
      await page.getByRole("option", { name: "Booked" }).click();
      await detail.getByRole("button", { name: "Add", exact: true }).click();
      await expect(detail.getByText(USERS.han.displayName)).toBeVisible({ timeout: 15_000 });
      await expect(detail.getByText("booked", { exact: true })).toBeVisible();
      await detail.getByRole("button", { name: "Close" }).click();

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.han.username);
      await openNotificationInbox(page);
      await expect(inboxRow(page, new RegExp(`booked you for "${title}"`))).toBeVisible({
        timeout: 20_000,
      });

      await goToProposals(page);
      await selectProposalTab(page, "Resolved");
      await openProposalCard(page, title);
      const hanDetail = page.getByRole("dialog");
      await expect(hanDetail.getByText("Accepted", { exact: true })).toBeVisible();
      await expect(hanDetail.getByRole("button", { name: "Accept" })).toHaveCount(0);
      await hanDetail.getByRole("button", { name: "Close" }).click();
    } finally {
      await restoreJustProposals(page);
    }
  });

  test("hides Booked when Just Proposals is on", async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, DEMO.resolvedCelebration);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Role")).toBeVisible();
    await dialog.getByLabel("Role").click();
    await expect(page.getByRole("option", { name: "Booked" })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "Required" })).toBeVisible();
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Close" }).click();
  });

  test("Post to Feed on a resolved event appears in Feed and then disables", async ({ page }) => {
    test.setTimeout(180_000);
    const title = `E2E Feed Post ${Date.now()}`;

    await login(page, USERS.luke.username);
    await goToProposals(page);
    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), "2099-12-11T12:00");
    await dialog.getByRole("button", { name: "Solo (just me)", exact: true }).click();
    await submitProposalDraft(page, dialog);

    await selectProposalTab(page, "Resolved");
    await openProposalCard(page, title);
    const detail = page.getByRole("dialog");
    const postBtn = detail.getByRole("button", { name: "Post to Feed" });
    await expect(postBtn).toBeEnabled();
    await postBtn.click();
    await expect(postBtn).toBeDisabled({ timeout: 15_000 });
    await detail.getByRole("button", { name: "Close" }).click();

    await goToFeed(page);
    const milestone = activeMainPanel(page).getByTestId("feed-milestone-card").filter({
      hasText: /Posted to Feed/i,
    });
    await expect(milestone.filter({ hasText: title }).first()).toBeVisible({ timeout: 20_000 });
  });
});

async function openNetworkSettings(page: Page): Promise<void> {
  await goToAdmin(page);
  await expandAdminSection(page, "Network settings");
}

async function setPostingMode(
  page: Page,
  mode: "Just Proposals" | "Proposals and Bookings",
): Promise<void> {
  await loginWithOnboardingIfNeeded(page, USERS.luke.username);
  await openNetworkSettings(page);
  const combo = page.getByRole("combobox", { name: "Proposal posting" });
  await expect(combo).toBeVisible({ timeout: 15_000 });
  await combo.click();
  await page.getByRole("option", { name: mode }).click();
  await page.getByRole("button", { name: /Save settings/i }).click();
  await expect(page.getByText(/Network settings saved/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function restoreJustProposals(page: Page): Promise<void> {
  try {
    await setPostingMode(page, "Just Proposals");
  } catch {
    // Best-effort restore for later serial specs.
  }
}
