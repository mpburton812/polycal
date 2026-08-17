/**
 * Local / promotion journey runner: skip unused mobile server, keep SAFE parallel (PC-214).
 * Usage: `npm run test:e2e:journeys`
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

process.env.E2E_INCLUDE_MOBILE = "0";
process.env.E2E_PARALLEL_WORKERS ??= "2";

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
  // Explicit files — cmd.exe on Windows strips regex filters like e2e/.*journey.* (PC-417).
  const journeyFiles = readdirSync("e2e")
    .filter((name) => name.includes("journey") && name.endsWith(".spec.ts"))
    .map((name) => path.join("e2e", name));
  if (journeyFiles.length === 0) {
    throw new Error("No e2e/*journey*.spec.ts files found");
  }
  await run(npx, [
    "playwright",
    "test",
    ...journeyFiles,
    "--project=chromium-serial",
    "--project=chromium-safe",
  ]);
}

main().catch((error) => {
  console.error("[e2e:journeys]", error);
  process.exit(1);
});
