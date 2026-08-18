import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { fillProposalDateRange } from "./helpers/datePickers";
import { USERS } from "./helpers/constants";
import { goToProposals } from "./helpers/navigation";
import {
  exitDraftDialog,
  openEventOrSleepingProposalDraft,
  openNewEventComposer,
} from "./helpers/proposals";

/**
 * Manual New Event progressive disclosure (PC-439 / PC-440).
 */
test.describe("New Event composer journey", () => {
  test("reveals Title → type → calendar → Who after dates, and skips Booking in Just Proposals", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await login(page, USERS.luke.username);
    await goToProposals(page);

    const dialog = await openNewEventComposer(page);
    await expect(dialog.getByRole("heading", { name: "New Event", exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Description")).toHaveCount(0);
    await expect(dialog.getByText("or", { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel("Title")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Social", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Sleeping", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Window", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "With Others", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Add times", exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Who:", { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel(/Custom location/i)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /More options/i })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Proposal", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Booking", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();

    await dialog.getByLabel("Title").fill(`E2E Disclosure ${Date.now()}`);
    await dialog.getByRole("button", { name: "Social", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Add times", exact: true })).toBeVisible();
    await expect(dialog.getByTestId("date-range-start").first()).toBeVisible();
    await expect(dialog.getByText("Who:", { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel(/Custom location/i)).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /More options/i })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Window", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "With Others", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Solo (just me)", exact: true })).toHaveCount(0);

    await fillProposalDateRange(dialog, "2099-10-01");
    await expect(dialog.getByText("Who:", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel(/Custom location/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /More options/i })).toBeVisible();

    await expect(dialog.getByText(USERS.leia.displayName).first()).toBeVisible();
    await dialog.getByRole("button", { name: `${USERS.leia.displayName} not selected` }).click();
    await expect(
      dialog.getByRole("button", { name: `${USERS.leia.displayName} required` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeEnabled();

    await dialog.getByRole("button", { name: "Social", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Social", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(dialog.getByRole("button", { name: "Add times", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();

    await dialog.getByRole("button", { name: "Social", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Add times", exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: `${USERS.leia.displayName} required` }),
    ).toHaveAttribute("aria-pressed", "true");

    await dialog.getByRole("button", { name: "Sleeping", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Window", exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel("Night of")).toBeVisible();
    await expect(dialog.getByText("Who:", { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Submit" })).toBeDisabled();

    await exitDraftDialog(dialog);

    const justProposals = await openEventOrSleepingProposalDraft(page);
    await expect(justProposals.getByRole("button", { name: "Proposal", exact: true })).toHaveCount(
      0,
    );
    await expect(justProposals.getByRole("button", { name: "Booking", exact: true })).toHaveCount(0);
    await exitDraftDialog(justProposals);
  });
});
