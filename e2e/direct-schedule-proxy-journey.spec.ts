import { expect, test } from "./helpers/test";
import type { Page } from "@playwright/test";

import { loginWithOnboardingIfNeeded, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { expandAdminSection } from "./helpers/admin";
import { goToAdmin, goToProposals, selectProposalTab } from "./helpers/navigation";
import {
  exitDraftDialog,
  openEventProposalDraft,
  proposalCard,
  submitProposalDraft,
} from "./helpers/proposals";

/**
 * Poll / posting / proxy admin gates (PC-423–PC-425).
 * Mutates Rebel Alliance network settings and restores defaults in finally.
 */
test.describe("Direct schedule and proxy journey", () => {
  test("Just Proposals vs Schedule posting, proxy scopes, and Poll off", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `Direct schedule ${Date.now()}`;

    try {
      await loginWithOnboardingIfNeeded(page, USERS.luke.username);
      await goToProposals(page);

      const defaultDraft = await openEventProposalDraft(page);
      await expect(defaultDraft.getByRole("button", { name: "Proposal", exact: true })).toHaveCount(
        0,
      );
      await expect(defaultDraft.getByRole("button", { name: "Poll", exact: true })).toBeVisible();
      await expect(defaultDraft.getByLabel("Schedule on behalf of")).toHaveCount(0);
      await exitDraftDialog(defaultDraft);

      await setPostingMode(page, "Proposals and Schedule");

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.han.username);
      await goToProposals(page);

      const dualDraft = await openEventProposalDraft(page);
      await expect(dualDraft.getByRole("button", { name: "Proposal", exact: true })).toBeVisible();
      await expect(dualDraft.getByRole("button", { name: "Schedule", exact: true })).toBeVisible();
      await expect(dualDraft.getByRole("button", { name: "Window", exact: true })).toHaveCount(0);
      await expect(dualDraft.getByLabel("Schedule on behalf of")).toHaveCount(0);

      await dualDraft.getByRole("button", { name: "Schedule", exact: true }).click();
      await expect(dualDraft.getByRole("button", { name: "Poll", exact: true })).toHaveCount(0);
      await expect(dualDraft.getByRole("button", { name: "Window", exact: true })).toBeVisible();
      await expect(dualDraft.getByRole("button", { name: "Add to calendar" })).toBeVisible();

      await dualDraft.getByLabel("Title").fill(title);
      await dualDraft.getByRole("button", { name: "With invitees" }).click();
      await expect(
        dualDraft.getByRole("button", { name: /Leia Organa required/i }),
      ).toHaveCount(0);
      await dualDraft.getByRole("button", { name: /Leia Organa include/i }).click();
      await fillProposalDateTimeField(dualDraft.getByLabel("Start").first(), "2099-11-15T10:00");
      await dualDraft.getByRole("button", { name: "Save", exact: true }).click();
      await submitProposalDraft(page, dualDraft);

      await selectProposalTab(page, "Resolved");
      await expect(proposalCard(page, title)).toBeVisible({ timeout: 20_000 });
      await selectProposalTab(page, "Proposed");
      await expect(proposalCard(page, title)).toHaveCount(0);

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.luke.username);
      await setProxyScheduling(page, true, "Sleeping partners only");

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.han.username);
      await goToProposals(page);
      const partnerDraft = await openEventProposalDraft(page);
      await partnerDraft.getByRole("button", { name: "Schedule", exact: true }).click();
      await expect(partnerDraft.getByLabel("Schedule on behalf of")).toBeVisible();
      await partnerDraft.getByLabel("Schedule on behalf of").click();
      await expect(page.getByRole("option", { name: USERS.leia.displayName })).toBeVisible();
      await expect(page.getByRole("option", { name: USERS.chewie.displayName })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await exitDraftDialog(partnerDraft);

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.luke.username);
      await setProxyScheduling(page, true, "Anyone on this network");

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.han.username);
      await goToProposals(page);
      const anyoneDraft = await openEventProposalDraft(page);
      await anyoneDraft.getByRole("button", { name: "Schedule", exact: true }).click();
      await anyoneDraft.getByLabel("Schedule on behalf of").click();
      await expect(page.getByRole("option", { name: USERS.chewie.displayName })).toBeVisible();
      await page.keyboard.press("Escape");
      await exitDraftDialog(anyoneDraft);

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.luke.username);
      await setPollEnabled(page, false);

      await logout(page);
      await loginWithOnboardingIfNeeded(page, USERS.han.username);
      await goToProposals(page);
      const noPollDraft = await openEventProposalDraft(page);
      await noPollDraft.getByRole("button", { name: "Proposal", exact: true }).click();
      await expect(noPollDraft.getByRole("button", { name: "Poll", exact: true })).toHaveCount(0);
      await exitDraftDialog(noPollDraft);
    } finally {
      await restoreDefaultComposerSettings(page);
    }
  });
});

async function openNetworkSettings(page: Page): Promise<void> {
  await goToAdmin(page);
  await expandAdminSection(page, "Network settings");
}

async function saveNetworkSettings(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Save settings/i }).click();
  await expect(page.getByText(/Network settings saved/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function selectLabeledCombobox(
  page: Page,
  label: string,
  option: string,
): Promise<void> {
  const combo = page.getByRole("combobox", { name: label });
  await expect(combo).toBeVisible({ timeout: 15_000 });
  await combo.click();
  await page.getByRole("option", { name: option }).click();
}

async function setPostingMode(
  page: Page,
  mode: "Just Proposals" | "Proposals and Schedule",
): Promise<void> {
  await loginWithOnboardingIfNeeded(page, USERS.luke.username);
  await openNetworkSettings(page);
  await selectLabeledCombobox(page, "Proposal posting", mode);
  await saveNetworkSettings(page);
}

async function setProxyScheduling(
  page: Page,
  enabled: boolean,
  scope?: "Anyone on this network" | "Sleeping partners only",
): Promise<void> {
  await loginWithOnboardingIfNeeded(page, USERS.luke.username);
  await openNetworkSettings(page);
  const toggle = page.getByLabel("Proxy Scheduling");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  const checked = await toggle.isChecked();
  if (checked !== enabled) {
    await toggle.click();
  }
  if (enabled && scope) {
    await selectLabeledCombobox(page, "Proxy for", scope);
  }
  await saveNetworkSettings(page);
}

async function setPollEnabled(page: Page, enabled: boolean): Promise<void> {
  await loginWithOnboardingIfNeeded(page, USERS.luke.username);
  await openNetworkSettings(page);
  const toggle = page.getByLabel("Enable Poll");
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.isChecked()) !== enabled) {
    await toggle.click();
  }
  await saveNetworkSettings(page);
}

async function restoreDefaultComposerSettings(page: Page): Promise<void> {
  try {
    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await openNetworkSettings(page);
    const poll = page.getByLabel("Enable Poll");
    if (!(await poll.isChecked())) {
      await poll.click();
    }
    await selectLabeledCombobox(page, "Proposal posting", "Just Proposals");
    await saveNetworkSettings(page);
  } catch {
    // Best-effort restore so later serial specs keep default Poll-on / Just Proposals.
  }
}
