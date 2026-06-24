import { test as base } from "@playwright/test";

import { resetE2eDatabase } from "./db";

/**
 * Resets the E2E database once per spec file so tests start from seed data.
 */
export const test = base.extend({
  _freshDb: [
    async ({ request }, use) => {
      await resetE2eDatabase(request);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
