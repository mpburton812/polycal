/**
 * Seeds one isolated E2E SQLite DB for a worker index (PC-214).
 * Intended to run in a child process so TURSO_DATABASE_URL never races across workers.
 *
 * Usage: `npx tsx scripts/e2e-prepare-worker.ts <workerIndex>`
 */
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

import { e2eDbUrl, e2eEnvForWorker } from "../e2e/e2e-env";

async function main(): Promise<void> {
  const workerIndex = Number(process.argv[2] ?? "0");
  if (!Number.isFinite(workerIndex) || workerIndex < 0) {
    throw new Error(`Invalid worker index: ${process.argv[2]}`);
  }

  const env = e2eEnvForWorker(workerIndex);
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  const { resetDbSingleton } = await import("../src/lib/db/client");
  resetDbSingleton();

  const dbFile = path.join(process.cwd(), `e2e-w${workerIndex}.db`);
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbFile}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }

  if (workerIndex === 0) {
    const legacy = path.join(process.cwd(), "e2e.db");
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = `${legacy}${suffix}`;
      if (existsSync(file)) unlinkSync(file);
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

main().catch((error) => {
  console.error(`[e2e] Prepare worker failed:`, error);
  process.exit(1);
});
