import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";

import { e2eDbUrl, e2eEnvForWorker } from "../e2e/e2e-env";
import { resolveServerCount } from "../e2e/parallel";

/**
 * Prepares isolated E2E SQLite databases for each parallel worker (PC-176).
 */
async function prepareWorkerDb(workerIndex: number): Promise<void> {
  const env = e2eEnvForWorker(workerIndex);
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const { resetDbSingleton } = await import("../src/lib/db/client");
  resetDbSingleton();

  const dbFile = path.join(process.cwd(), `e2e-w${workerIndex}.db`);
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbFile}${suffix}`;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }

  // Legacy single-file name from older runs.
  if (workerIndex === 0) {
    const legacy = path.join(process.cwd(), "e2e.db");
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = `${legacy}${suffix}`;
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
  }

  console.log(`[e2e] Worker ${workerIndex}: migrations for ${e2eDbUrl(workerIndex)}…`);
  const { runMigrations } = await import("../src/lib/db/migrate");
  await runMigrations();

  console.log(`[e2e] Worker ${workerIndex}: seeding Star Wars + demo + BT overlay…`);
  const { resetTestDatabase } = await import("../src/lib/seed/reset-test-database");
  const result = await resetTestDatabase();
  const { seedE2eBurtonThompsonOverlay } = await import(
    "../src/lib/seed/e2e-burton-thompson-overlay"
  );
  await seedE2eBurtonThompsonOverlay();
  console.log(
    `[e2e] Worker ${workerIndex}: ready (${result.userCount} users, ${result.proposalCount} proposals).`,
  );

  resetDbSingleton();
}

async function main(): Promise<void> {
  mkdirSync(path.join(process.cwd(), "e2e", ".auth"), { recursive: true });
  const servers = resolveServerCount();
  console.log(`[e2e] Preparing ${servers} database(s)…`);
  for (let i = 0; i < servers; i += 1) {
    await prepareWorkerDb(i);
  }
}

main().catch((error) => {
  console.error("[e2e] Prepare failed:", error);
  process.exit(1);
});
