import { test as base } from "@playwright/test";
import path from "node:path";

import { E2E_PORT } from "../e2e-env";
import { dbIndexForProject } from "../parallel";
import { resetE2eDatabase } from "./db";

const AUTH_DIR = path.join(__dirname, "..", ".auth");

/**
 * Resets the E2E database once per test and pins baseURL/storage to the worker origin (PC-176).
 */
export const test = base.extend<{ _freshDb: void }>({
  baseURL: async ({}, use, testInfo) => {
    const index = dbIndexForProject(testInfo.project.name, testInfo.workerIndex);
    await use(`http://localhost:${E2E_PORT + index}`);
  },
  storageState: async ({}, use, testInfo) => {
    const index = dbIndexForProject(testInfo.project.name, testInfo.workerIndex);
    await use(path.join(AUTH_DIR, `luke-w${index}.json`));
  },
  _freshDb: [
    async ({ request }, use) => {
      await resetE2eDatabase(request);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";

/** Empty storage for specs that assert login / unauthenticated redirects (PC-175). */
export const emptyStorageState = { cookies: [], origins: [] };
