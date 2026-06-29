import { expect, test } from "./helpers/test";

import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { goToProfile } from "./helpers/navigation";
import { seedNotificationPrefsJson } from "./helpers/notification-prefs";

test.describe("Alert preferences journey", () => {
  test("legacy stored prefs migrate to four alert-type toggles and persist after save", async ({
    page,
    request,
  }) => {
    await seedNotificationPrefsJson(request, USERS.leia.username, {
      globalEnabled: true,
      channels: { email: false, sms: false, device: true },
      alertTypes: { proposals: false, partnerships: true, events: false },
    });

    await login(page, USERS.leia.username);
    await goToProfile(page);

    await expect(page.getByRole("checkbox", { name: "Sleeping proposals" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Event proposals" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Sleeping partner proposals" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Reminders" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "In-app inbox" })).toBeChecked();

    await page.getByRole("checkbox", { name: "Event proposals" }).check();
    await page.getByRole("checkbox", { name: "Reminders" }).check();
    await page.getByRole("button", { name: "Save notification preferences" }).click();
    await expect(page.getByText(/Notification preferences saved/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.reload();
    await goToProfile(page);
    await expect(page.getByRole("checkbox", { name: "Event proposals" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Reminders" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Sleeping proposals" })).not.toBeChecked();
  });
});
