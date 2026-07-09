import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { fillProposalDateTimeField } from "./helpers/datePickers";
import { goToProposals } from "./helpers/navigation";
import {
  openEventProposalDraft,
  proposalCard,
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
    const { start } = oneHourEventWindow();

    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
    await selectEventIcon(dialog, "Food and pizza event");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), start);
    await dialog.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialog);

    await expect(proposalCard(page, title)).toBeVisible({ timeout: 20_000 });
    await proposalCard(page, title).click();

    const detail = page.getByRole("dialog");
    await expect(detail.getByRole("img", { name: "Food and pizza event" })).toBeVisible();
  });

  test("clone copies event icon into edit draft", async ({ page }) => {
    const title = `Clone icon ${Date.now()}`;
    const { start } = oneHourEventWindow();

    const dialog = await openEventProposalDraft(page);
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByRole("button", { name: "Solo event (just me)" }).click();
    await selectEventIcon(dialog, "Gaming event");
    await fillProposalDateTimeField(dialog.getByLabel("Start").first(), start);
    await dialog.getByRole("button", { name: "Save" }).click();
    await submitProposalDraft(page, dialog);

    await expect(proposalCard(page, title)).toBeVisible({ timeout: 20_000 });
    await proposalCard(page, title).click();

    const detail = page.getByRole("dialog");
    await detail.getByRole("button", { name: "Clone" }).click();

    const draft = page.getByRole("dialog");
    await expect(draft.getByLabel("Title")).toHaveValue(`${title} (copy)`, { timeout: 15_000 });
    await expect(draft.getByRole("button", { name: "Gaming event" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
