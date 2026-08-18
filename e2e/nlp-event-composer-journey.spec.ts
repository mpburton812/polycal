import { expect, test } from "./helpers/test";
import type { Page } from "@playwright/test";

import { loginWithOnboardingIfNeeded } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { expandAdminSection } from "./helpers/admin";
import { goToAdmin, goToProposals } from "./helpers/navigation";
import { openNlpEventComposer } from "./helpers/proposals";
import { expectToast } from "./helpers/toast";

/**
 * NLP composer Booking-for from a named sleeper (PC-439 / PC-441).
 */
test.describe("NLP event composer journey", () => {
  test("books Leia at Luke's when Proposals and Bookings is on", async ({ page }) => {
    test.setTimeout(180_000);

    await enableBookingsForAnyone(page);
    await goToProposals(page);

    const dialog = await openNlpEventComposer(page);
    await expect(
      dialog.getByRole("heading", { name: "New Event (NLP Input)", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByLabel("Description")).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveCount(0);
    await expect(dialog.getByText("or", { exact: true })).toHaveCount(0);

    await dialog.getByLabel("Description").fill("Leia sleeps at Luke's tonight");
    await expect(dialog.getByRole("button", { name: "Sleeping", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
      { timeout: 15_000 },
    );
    await expect(dialog.getByRole("button", { name: "Booking", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog.getByRole("combobox", { name: "Booking for" })).toContainText(
      USERS.leia.displayName,
    );
    await expect(dialog.getByText("Who:", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/location:/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Add to calendar" })).toBeEnabled();
  });

  test("toasts and blocks submit when Booking for others is off", async ({ page }) => {
    test.setTimeout(180_000);

    await loginWithOnboardingIfNeeded(page, USERS.luke.username);
    await goToProposals(page);

    const dialog = await openNlpEventComposer(page);
    await dialog.getByLabel("Description").fill("Leia sleeps at Luke's tonight");
    await expectToast(page, "Booking for others is not enabled.");
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();
    await expect(dialog.getByRole("combobox", { name: "Booking for" })).toHaveCount(0);
  });
});

async function openNetworkSettings(page: Page): Promise<void> {
  await goToAdmin(page);
  await expandAdminSection(page, "Network Configuration");
}

async function enableBookingsForAnyone(page: Page): Promise<void> {
  await loginWithOnboardingIfNeeded(page, USERS.luke.username);
  await openNetworkSettings(page);
  const posting = page.getByRole("combobox", { name: "Proposal posting" });
  await expect(posting).toBeVisible({ timeout: 15_000 });
  await posting.click();
  await page.getByRole("option", { name: "Proposals and Bookings" }).click();
  const bookingFor = page.getByRole("combobox", { name: "Booking for" });
  await expect(bookingFor).toBeVisible({ timeout: 15_000 });
  await bookingFor.click();
  await page.getByRole("option", { name: "Anyone on this network" }).click();
  await page.getByRole("button", { name: /Save settings/i }).click();
  await expect(page.getByText(/Network settings saved/i).first()).toBeVisible({
    timeout: 15_000,
  });
}
