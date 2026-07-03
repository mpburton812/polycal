#!/usr/bin/env npx tsx
/**
 * Promote `dev` to `test` via GitHub PR:
 *   1. npm audit gate
 *   2. Vitest unit tests
 *   3. CHANGELOG validation on dev vs test delta
 *   4. gh pr create --base test --head dev (or report existing)
 *
 * Usage:
 *   npm run promote-dev-to-test
 *   npm run promote-dev-to-test -- --merge
 */
import { execFileSync } from "node:child_process";

const useShell = process.platform === "win32";

function resolveCommand(command: string): string {
  if (useShell && ["npm", "npx"].includes(command)) {
    return `${command}.cmd`;
  }
  return command;
}

function runCapture(command: string, args: string[]): string {
  return execFileSync(resolveCommand(command), args, {
    encoding: "utf8",
    shell: useShell,
  }).trim();
}

function git(args: string[]): string {
  return runCapture("git", args);
}

function gh(args: string[]): string {
  return runCapture("gh", args);
}

function runInherit(command: string, args: string[]): void {
  execFileSync(resolveCommand(command), args, {
    stdio: "inherit",
    shell: useShell,
  });
}

interface OpenPullRequest {
  number: number;
  url: string;
}

function findOpenPr(): OpenPullRequest | null {
  const output = gh([
    "pr",
    "list",
    "--base",
    "test",
    "--head",
    "dev",
    "--state",
    "open",
    "--json",
    "number,url",
  ]);

  if (!output) return null;
  const pulls = JSON.parse(output) as OpenPullRequest[];
  return pulls[0] ?? null;
}

function waitForChecks(prNumber: number): void {
  console.log(`[promote-dev-to-test] Waiting for checks on PR #${prNumber}...`);
  runInherit("gh", ["pr", "checks", String(prNumber), "--watch"]);
}

function main(): void {
  const shouldMerge = process.argv.includes("--merge");
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  console.log("[promote-dev-to-test] Promoting dev → test");

  runInherit("git", ["fetch", "origin", "dev", "test"]);

  console.log("[promote-dev-to-test] Running npm audit...");
  runInherit("npm", ["audit", "--audit-level=low"]);

  console.log("[promote-dev-to-test] Running Vitest unit tests...");
  runInherit("npm", ["run", "test:unit"]);

  console.log("[promote-dev-to-test] Validating CHANGELOG.md for dev commits...");
  runInherit("npx", [
    "tsx",
    "scripts/validate-changelog.ts",
    "--range",
    "origin/test...origin/dev",
    "--branch",
    "feature/promotion",
  ]);

  let pull = findOpenPr();
  if (pull) {
    console.log(`[promote-dev-to-test] Open PR already exists: ${pull.url}`);
  } else {
    console.log("[promote-dev-to-test] Creating pull request...");
    runInherit("gh", [
      "pr",
      "create",
      "--base",
      "test",
      "--head",
      "dev",
      "--title",
      "chore: promote dev to test",
      "--body",
      "## Summary\n- Promote latest dev to test.\n\n## Test plan\n- [ ] CI green",
    ]);
    pull = findOpenPr();
  }

  if (!pull) {
    console.error("[promote-dev-to-test] Could not find or create a pull request.");
    process.exit(1);
  }

  console.log(`[promote-dev-to-test] PR ready: ${pull.url}`);

  if (shouldMerge) {
    waitForChecks(pull.number);
    console.log("[promote-dev-to-test] Merging pull request...");
    runInherit("gh", ["pr", "merge", String(pull.number), "--merge"]);
    console.log("[promote-dev-to-test] Merged to test.");
  } else {
    console.log(
      "[promote-dev-to-test] Next: gh pr merge",
      pull.number,
      "--merge",
    );
  }
}

main();
