/**
 * Local / promotion journey runner: skip unused mobile server, keep SAFE parallel (PC-214).
 * Usage: `npm run test:e2e:journeys`
 */
import { spawn } from "node:child_process";

process.env.E2E_INCLUDE_MOBILE = "0";
process.env.E2E_SAFE_INDEPENDENT = "1";
process.env.E2E_PARALLEL_WORKERS ??= process.platform === "win32" ? "1" : "2";

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
      shell: isWin,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Command failed (${code}): ${command} ${args.join(" ")}`));
      else resolve();
    });
  });
}

async function main(): Promise<void> {
  await run(npx, ["tsx", "scripts/e2e-prepare.ts"]);
  // Single token — cmd.exe on Windows eats slash/regex filters (PC-417).
  await run(npx, [
    "playwright",
    "test",
    "journey",
    "--project=chromium-serial",
    "--project=chromium-safe",
  ]);
}

main().catch((error) => {
  console.error("[e2e:journeys]", error);
  process.exit(1);
});
