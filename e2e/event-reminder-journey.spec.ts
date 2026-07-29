import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { runEnforcementCron } from "./helpers/cron";
import { minutesFromNowDateTime } from "./helpers/datePickers";
import { dismissMotdDialogIfOpen } from "./helpers/motd";
import { goToProposals } from "./helpers/navigation";
import { expectInAppNotification } from "./helpers/notifications";
import { createAndSubmitSoloEventWithReminder } from "./helpers/proposals";

test.describe("Event reminder journey", () => {
  test("cron sends in-app reminder for resolved solo event in reminder window", async ({
    page,
    request,
  }) => {
    const title = `E2E event reminder ${Date.now()}`;
    const start = minutesFromNowDateTime(20);
    const end = minutesFromNowDateTime(80);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await dismissMotdDialogIfOpen(page);
    await createAndSubmitSoloEventWithReminder(page, {
      title,
      start,
      end,
      reminderAmount: 30,
      reminderUnit: "minutes",
    });

    const { remindersSent } = await runEnforcementCron(request);
    expect(remindersSent).toBeGreaterThanOrEqual(1);

    await expectInAppNotification(page, new RegExp(`Reminder:.*${title}`, "i"));
  });

  test("reminder suppressed when Reminders alert type is disabled", async ({ page, request }) => {
    const title = `E2E reminder blocked ${Date.now()}`;
    const start = minutesFromNowDateTime(15);
    const end = minutesFromNowDateTime(75);

    await login(page, USERS.luke.username);
    await dismissMotdDialogIfOpen(page);
    await page.goto("/profile");
    await dismissMotdDialogIfOpen(page);
    await page.getByRole("checkbox", { name: "Reminders" }).uncheck();
    await page.getByRole("button", { name: "Save notification preferences" }).click();
    await expect(page.getByText(/Notification preferences saved/i)).toBeVisible({
      timeout: 15_000,
    });

    await goToProposals(page);
    await dismissMotdDialogIfOpen(page);
    await createAndSubmitSoloEventWithReminder(page, {
      title,
      start,
      end,
      reminderAmount: 30,
      reminderUnit: "minutes",
    });

    await runEnforcementCron(request);
    await page.reload();
    await dismissMotdDialogIfOpen(page);
    await page.getByRole("button", { name: /notifications/i }).click();
    await expect(page.getByText(new RegExp(`Reminder:.*${title}`, "i"))).toHaveCount(0);
    // Drawer can remount when MOTD archive / inbox refresh races; Escape is enough cleanup.
    await page.keyboard.press("Escape");
  });
});
