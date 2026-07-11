import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

import { E2E_PORT, e2eEnvForWorker } from "./e2e/e2e-env";
import {
  dbIndexForProject,
  resolveParallelWorkers,
  resolveServerCount,
  safeParallelTestMatch,
  serialTestIgnore,
} from "./e2e/parallel";

const parallelWorkers = resolveParallelWorkers();
const serverCount = resolveServerCount();
const authDir = path.join(__dirname, "e2e", ".auth");

function lukeStorage(dbIndex: number): string {
  return path.join(authDir, `luke-w${dbIndex}.json`);
}

function webServers() {
  return Array.from({ length: serverCount }, (_, workerIndex) => {
    const port = E2E_PORT + workerIndex;
    const env = e2eEnvForWorker(workerIndex);
    return {
      command: process.env.CI
        ? `npx next start -p ${port}`
        : `npx next dev -p ${port}`,
      url: `http://localhost:${port}/login`,
      reuseExistingServer: !process.env.CI,
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
      // Owns DB indices 1..N — can run in parallel with serial on w0 (PC-176).
      name: "chromium-safe",
      dependencies: ["setup"],
      testMatch: safeParallelTestMatch(),
      fullyParallel: parallelWorkers > 1,
      workers: parallelWorkers,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${E2E_PORT + dbIndexForProject("chromium-safe", 0)}`,
        storageState: lukeStorage(dbIndexForProject("chromium-safe", 0)),
      },
    },
    {
      name: "mobile-chrome",
      dependencies: ["setup"],
      testMatch: /mobile-smoke\.spec\.ts$/,
      workers: 1,
      use: {
        ...devices["Pixel 5"],
        baseURL: `http://localhost:${E2E_PORT}`,
        storageState: lukeStorage(0),
      },
    },
  ],
  webServer: webServers(),
});
