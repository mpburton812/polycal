/**
 * Playwright webServer wrapper — labels unexpected Next process exits (PC-214).
 *
 * Usage: `npx tsx scripts/e2e-serve.ts --port 3099 --mode start|dev`
 */
import { spawn } from "node:child_process";

function argValue(flag: string, fallback?: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required ${flag}`);
}

const port = argValue("--port");
const mode = argValue("--mode", process.env.CI ? "start" : "dev");
const isWin = process.platform === "win32";
const child = spawn(
  isWin ? "npx.cmd" : "npx",
  ["next", mode, "-p", port],
  {
    stdio: "inherit",
    env: process.env,
    // Windows needs shell to resolve npx.cmd; args stay as argv (no string concat).
    shell: isWin,
  },
);

function fatal(message: string, code = 1): never {
  console.error(`[e2e] FATAL webServer died: ${message} (port=${port} mode=${mode})`);
  process.exit(code);
}

child.on("error", (error) => {
  fatal(error.message);
});

child.on("exit", (code, signal) => {
  if (signal) fatal(`signal ${signal}`, 1);
  if (code !== 0 && code !== null) fatal(`exit code ${code}`, code);
  // Clean exit (Playwright stopped the server) — propagate 0.
  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
