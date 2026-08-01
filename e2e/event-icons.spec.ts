import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals, openProposalCard } from "./helpers/navigation";
import {
  expectResolvedProposal,
  expandDraftMoreOptions,
  openEventProposalDraft,
  selectEventIcon,
  submitProposalDraft,
} from "./helpers/proposals";
import { oneHourEventWindow } from "./helpers/schedule";

test.describe("Event category icons (PC-116)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, USERS.luke.username);
    await goToProposals(page);
  });

  test("saves icon on solo event and shows on proposal detail", async ({ page }) => {
    const title = `Icon test ${Date.now()}`;
    const { start, end } = oneHourEventWindow(40, 10);

    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
    await selectEventIcon(dialog, "Food and pizza event");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), start);
    await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), end);
    await dialog.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialog);

    await expectResolvedProposal(page, title);
    // Click the title heading — admin Delete on the card must not steal the click (PC-295).
    await openProposalCard(page, title);

    const detail = page.getByRole("dialog");
    await expect(detail.getByRole("img", { name: "Food and pizza event" })).toBeVisible();
  });

  test("re-draft keeps event icon on the returned draft", async ({ page }) => {
    const title = `Redraft icon ${Date.now()}`;
    const { start, end } = oneHourEventWindow(41, 10);

    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
    await selectEventIcon(dialog, "Gaming event");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), start);
    await fillProposalDateTimeField(dialog.getByLabel("End (optional)").first(), end);
    await dialog.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialog);

    await expectResolvedProposal(page, title);
    await openProposalCard(page, title);

    const detail = page.getByRole("dialog");
    page.once("dialog", (confirmDialog) => confirmDialog.accept());
    await detail.getByRole("button", { name: "Re-draft" }).click();

    const draft = page.getByRole("dialog");
    await expect(draft.getByLabel("Title")).toHaveValue(title, { timeout: 15_000 });
    await expandDraftMoreOptions(draft);
    await expect(draft.getByRole("button", { name: "Gaming event" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
