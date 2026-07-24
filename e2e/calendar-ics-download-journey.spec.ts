import fs from "node:fs/promises";

import { type Page } from "@playwright/test";

import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import {
  goToProfile,
  goToProposals,
  openProposalCard,
  selectProposalTab,
} from "./helpers/navigation";
import { inboxRow, openNotificationInbox } from "./helpers/notifications";
import { createAndSubmitSoloEvent, proposalCard } from "./helpers/proposals";

/**
 * Enables iCal / Other download-only delivery for the signed-in user (PC-345).
 */
async function enableIcsDownloadOnly(page: Page): Promise<void> {
  await goToProfile(page);
  const icsRadio = page.getByLabel("iCal / Other (.ics file)");
  await icsRadio.scrollIntoViewIfNeeded();
  await icsRadio.check();
  await page.getByLabel("Download only").check();
  await page.getByRole("button", { name: "Save iCal / Other preferences" }).click();
  await expect(page.getByText(/preferences saved/i)).toBeVisible({
    timeout: 15_000,
  });
}

/** Unfolds ICS lines (RFC 5545 folding) into a single string for assertions. */
function unfoldIcs(raw: string): string {
  return raw.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

test.describe("Calendar ICS download journey", () => {
  test("solo resolve queues ICS; card/inbox download matches PolyCal", async ({ page }) => {
    test.setTimeout(240_000);

    const tag = Date.now();
    const title = `E2E ICS Download ${tag}`;
    const start = "2099-11-12T15:00";
    const end = "2099-11-12T17:00";
    const titleEscaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    await login(page, USERS.luke.username);
    await enableIcsDownloadOnly(page);

    await goToProposals(page);
    await createAndSubmitSoloEvent(page, { title, start, end });

    await selectProposalTab(page, "Resolved");
    const card = proposalCard(page, title);
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Prefer accessible name on either link or button (MUI Button+href).
    const downloadBtn = card.getByRole("link", { name: "Download ICS" }).or(
      card.getByRole("button", { name: "Download ICS" }),
    );
    await expect(downloadBtn).toBeVisible({ timeout: 30_000 });

    const firstDownloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const firstDownload = await firstDownloadPromise;
    const firstPath = await firstDownload.path();
    expect(firstPath).toBeTruthy();
    const firstBody = unfoldIcs(await fs.readFile(firstPath!, "utf8"));

    expect(firstBody).toContain("BEGIN:VEVENT");
    expect(firstBody).toMatch(new RegExp(`SUMMARY:${titleEscaped}`));
    expect(firstBody).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(firstBody).toMatch(/DTEND:\d{8}T\d{6}Z/);
    expect(firstBody).toMatch(/UID:polycal-/);

    // Remains available after the first download (PC-345).
    await expect(downloadBtn).toBeVisible();
    const secondDownloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    await secondDownloadPromise;

    await openProposalCard(page, title);
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("link", { name: "Download ICS" }).or(
        dialog.getByRole("button", { name: "Download ICS" }),
      ),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    // Inbox is SSR-seeded — reload so calendar_ics_pending appears (PC-345).
    await page.reload();
    await openNotificationInbox(page);
    const row = inboxRow(
      page,
      new RegExp(`You have a calendar ics available for the event : ${titleEscaped}`),
    );
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(
      row.getByRole("link", { name: "Download ICS" }).or(
        row.getByRole("button", { name: "Download ICS" }),
      ),
    ).toBeVisible();
  });
});
