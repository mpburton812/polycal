#!/usr/bin/env node
/**
 * Make Bubblewrap runnable for TWA work without adding it to the app lockfile.
 *
 * Why global: `@bubblewrap/cli@1.25.0` as a root devDependency pulled 10 npm
 * audit findings and would fail the feature→dev gate. The CLI is a packaging
 * tool, not a runtime dep.
 *
 * Usage: node scripts/ensure-bubblewrap.mjs
 */
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const CLI_SPEC = "@bubblewrap/cli@1.25.0";

/**
 * Windows Node 20+ refuses to spawn `.cmd` without a shell (EINVAL). Always
 * use a shell so `npm` / `bubblewrap` shims resolve on PATH.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ inherit?: boolean }} [opts]
 */
function run(command, args, opts = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
    stdio: opts.inherit ? "inherit" : "pipe",
  });
}

/**
 * Directory that must be on PATH so `bubblewrap` resolves.
 *
 * @returns {string}
 */
function globalNpmBin() {
  const prefix = run("npm", ["prefix", "-g"]);
  if (prefix.status === 0 && prefix.stdout?.trim()) {
    const root = prefix.stdout.trim();
    return process.platform === "win32" ? root : path.join(root, "bin");
  }
  if (process.platform === "win32") {
    return path.join(os.homedir(), "AppData", "Roaming", "npm");
  }
  return path.join(os.homedir(), ".npm-global", "bin");
}

/**
 * Prepend a bin dir for this process so a just-installed global shim is found.
 *
 * @param {string} binDir
 */
function prependPath(binDir) {
  const sep = path.delimiter;
  const parts = (process.env.PATH ?? "").split(sep).filter(Boolean);
  if (!parts.some((part) => part.toLowerCase() === binDir.toLowerCase())) {
    process.env.PATH = [binDir, ...parts].join(sep);
  }
}

/**
 * Persist `%AppData%\npm` on the Windows user PATH when a fresh global install
 * would otherwise only work in the current shell.
 *
 * @param {string} binDir
 */
function persistWindowsUserPath(binDir) {
  if (process.platform !== "win32") return;
  const current = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    "[Environment]::GetEnvironmentVariable('Path','User')",
  ]);
  const userPath = (current.stdout ?? "").trim();
  const parts = userPath.split(";").filter(Boolean);
  const normalized = binDir.replace(/\\+$/, "").toLowerCase();
  if (parts.some((part) => part.replace(/\\+$/, "").toLowerCase() === normalized)) {
    return;
  }
  const next = userPath ? `${userPath};${binDir}` : binDir;
  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `[Environment]::SetEnvironmentVariable('Path', '${next.replace(/'/g, "''")}', 'User')`,
  ]);
  console.log(
    `Added ${binDir} to the user PATH. Open a new terminal if this shell still cannot find bubblewrap.`,
  );
}

/**
 * @returns {string | null}
 */
function bubblewrapVersionOutput() {
  const result = run("bubblewrap", ["--version"]);
  if (result.status !== 0) return null;
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  return text || "bubblewrap (version output empty)";
}

function installGlobal() {
  console.log(`Installing ${CLI_SPEC} globally so bubblewrap is on PATH…`);
  const result = run("npm", ["install", "--global", CLI_SPEC], { inherit: true });
  if (result.status !== 0) {
    throw new Error(`npm install --global ${CLI_SPEC} failed with status ${result.status}`);
  }
}

const binDir = globalNpmBin();
prependPath(binDir);

let output = bubblewrapVersionOutput();
if (!output) {
  installGlobal();
  prependPath(binDir);
  persistWindowsUserPath(binDir);
  output = bubblewrapVersionOutput();
}

if (!output) {
  console.error(
    `bubblewrap is still not runnable. Install ${CLI_SPEC} globally and put ${binDir} on PATH.`,
  );
  process.exit(1);
}

console.log(`bubblewrap is available (${binDir})`);
console.log(output);
process.exit(0);
