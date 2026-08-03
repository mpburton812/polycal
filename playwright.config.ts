import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

import { E2E_PORT, e2eEnvForWorker } from "./e2e/e2e-env";
import {
  dbIndexForProject,
  includeMobileServer,
  mobileDbIndex,
  resolveParallelWorkers,
  resolveServerCount,
  safeParallelTestMatch,
  serialTestIgnore,
} from "./e2e/parallel";

const parallelWorkers = resolveParallelWorkers();
const serverCount = resolveServerCount();
const mobileIndex = mobileDbIndex();
const authDir = path.join(__dirname, "e2e", ".auth");
/** Explicit opt-in — default off so local runs never attach to a stale wrong-env process (PC-214). */
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "1";

function lukeStorage(dbIndex: number): string {
  return path.join(authDir, `luke-w${dbIndex}.json`);
}

/**
 * Wraps next start/dev so an unexpected process exit is labeled as webServer death (PC-214).
 */
function webServers() {
  return Array.from({ length: serverCount }, (_, workerIndex) => {
    const port = E2E_PORT + workerIndex;
    const env = e2eEnvForWorker(workerIndex);
    const mode = process.env.CI ? "start" : "dev";
    return {
      command: `npx tsx scripts/e2e-serve.ts --port ${port} --mode ${mode}`,
      url: `http://localhost:${port}/login`,
      reuseExistingServer,
      timeout: 180_000,
      stdout: "pipe" as const,
      stderr: "pipe" as const,
      env: {
        ...process.env,
        ...env,
        NODE_ENV: process.env.CI ? "production" : "development",
      },
    };
  });
}

const safeDependencies =
  parallelWorkers <= 1 ? (["chromium-serial"] as const) : (["setup"] as const);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    // Seeded users (luke) use America/New_York — CI runners default to UTC, which
    // shifts midnight timed drafts to the previous evening on the schedule (PC-408).
    timezoneId: "America/New_York",
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
      use: { baseURL: `http://localhost:${E2E_PORT}` },
    },
    {
      name: "chromium-serial",
      dependencies: ["setup"],
      testIgnore: serialTestIgnore(),
      fullyParallel: false,
      workers: 1,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${E2E_PORT}`,
        storageState: lukeStorage(0),
      },
    },
    {
      // Owns DB indices 1..N when parallelizing; when workers≤1 shares w0 after serial (PC-213).
      name: "chromium-safe",
      dependencies: [...safeDependencies],
      testMatch: safeParallelTestMatch(),
      fullyParallel: parallelWorkers > 1,
      workers: parallelWorkers,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${E2E_PORT + dbIndexForProject("chromium-safe", 0)}`,
        storageState: lukeStorage(dbIndexForProject("chromium-safe", 0)),
      },
    },
    ...(includeMobileServer()
      ? [
          {
            name: "mobile-chrome",
            dependencies: ["setup"],
            testMatch: /mobile-smoke\.spec\.ts$/,
            workers: 1,
            use: {
              ...devices["Pixel 5"],
              baseURL: `http://localhost:${E2E_PORT + mobileIndex}`,
              storageState: lukeStorage(mobileIndex),
            },
          },
        ]
      : []),
  ],
  webServer: webServers(),
});
