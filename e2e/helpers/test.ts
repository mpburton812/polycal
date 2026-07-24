import { test as base } from "@playwright/test";
import path from "node:path";

import { E2E_PORT } from "../e2e-env";
import { dbIndexForProject } from "../parallel";
import { resetE2eDatabase } from "./db";

const AUTH_DIR = path.join(__dirname, "..", ".auth");

type WorkerScoped = {
  baseURL: string;
  storageState: string | { cookies: []; origins: [] };
};

/**
 * Pins baseURL/storage to the Playwright project worker origin (PC-176 / PC-213).
 * Marked as options so specs can override (e.g. emptyStorageState for public auth flows).
 */
const workerScoped = base.extend<WorkerScoped>({
  baseURL: [
    async ({}, use, testInfo) => {
      const index = dbIndexForProject(testInfo.project.name, testInfo.workerIndex);
      await use(`http://localhost:${E2E_PORT + index}`);
    },
    { option: true },
  ],
  storageState: [
    async ({}, use, testInfo) => {
      const index = dbIndexForProject(testInfo.project.name, testInfo.workerIndex);
      await use(path.join(AUTH_DIR, `luke-w${index}.json`));
    },
    { option: true },
  ],
});

/**
 * Default fixture: resets the E2E database once per test (PC-176).
 */
export const test = workerScoped.extend<{ _freshDb: void }>({
  _freshDb: [
    async ({ request }, use, testInfo) => {
      // Absolute origin avoids project-level baseURL sticking to worker 0 (PC-345).
      const index = dbIndexForProject(testInfo.project.name, testInfo.workerIndex);
      const origin = `http://localhost:${E2E_PORT + index}`;
      await resetE2eDatabase(request, origin);
      await use();
    },
    { auto: true },
  ],
});

/**
 * File-/describe-owned DB — caller resets in `beforeAll` (serial multi-phase journeys).
 * Avoids wiping shared state between serial tests in the same file (PC-214).
 */
export const testManualDb = workerScoped;

export { expect } from "@playwright/test";

/** Empty storage for specs that assert login / unauthenticated redirects (PC-175). */
export const emptyStorageState = { cookies: [], origins: [] };
