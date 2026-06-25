import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";

import { E2E_ENV } from "../e2e/e2e-env";

/**
 * Prepares the isolated E2E SQLite database (run before Playwright, not inside it).
 */
async function main(): Promise<void> {
  for (const [key, value] of Object.entries(E2E_ENV)) {
    process.env[key] = value;
  }

  const dbPath = path.join(process.cwd(), "e2e.db");
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }

  console.log("[e2e] Running migrations…");
  const { runMigrations } = await import("../src/lib/db/migrate");
  await runMigrations();

  console.log("[e2e] Seeding Star Wars + demo proposals (local e2e.db — not polycal-test)…");
  const { resetTestDatabase } = await import("../src/lib/seed/reset-test-database");
  const result = await resetTestDatabase();
  console.log(`[e2e] Ready (${result.userCount} users, ${result.proposalCount} proposals).`);
}

main().catch((error) => {
  console.error("[e2e] Prepare failed:", error);
  process.exit(1);
});
