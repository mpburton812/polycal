import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { resolveServerCount } from "../e2e/parallel";

/**
 * Prepares isolated E2E SQLite databases in parallel child processes (PC-214).
 * Each worker gets its own process.env so the DB singleton never cross-talks.
 */
function prepareWorkerDb(workerIndex: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tsxCli = path.join(
      process.cwd(),
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );
    const child = spawn(
      process.execPath,
      [tsxCli, path.join("scripts", "e2e-prepare-worker.ts"), String(workerIndex)],
      {
        stdio: "inherit",
        env: process.env,
        cwd: process.cwd(),
      },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Worker ${workerIndex} killed by ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Worker ${workerIndex} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function main(): Promise<void> {
  mkdirSync(path.join(process.cwd(), "e2e", ".auth"), { recursive: true });
  const servers = resolveServerCount();
  console.log(`[e2e] Preparing ${servers} database(s) in parallel…`);
  await Promise.all(
    Array.from({ length: servers }, (_, i) => prepareWorkerDb(i)),
  );
  console.log(`[e2e] All ${servers} database(s) ready.`);
}

main().catch((error) => {
  console.error("[e2e] Prepare failed:", error);
  process.exit(1);
});
