#!/usr/bin/env npx tsx
/**
 * Promote the current feature/* branch toward dev:
 *   1. npm audit gate
 *   2. Jira key validation (commits vs origin/dev)
 *   3. git push -u origin HEAD
 *   4. gh pr create --base dev --fill (or report existing open PR)
 *
 * Usage:
 *   npm run merge-feature
 *   npm run merge-feature -- --merge   # also merge PR after checks pass
 */
import { execFileSync } from "node:child_process";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function runInherit(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

interface OpenPullRequest {
  number: number;
  url: string;
}

function currentBranch(): string {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

function findOpenPr(branch: string): OpenPullRequest | null {
  const output = gh([
    "pr",
    "list",
    "--base",
    "dev",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "number,url",
  ]);

  if (!output) {
    return null;
  }

  const pulls = JSON.parse(output) as OpenPullRequest[];
  return pulls[0] ?? null;
}

function waitForChecks(prNumber: number): void {
  console.log(`[merge-feature] Waiting for required checks on PR #${prNumber}...`);
  runInherit("gh", ["pr", "checks", String(prNumber), "--watch"]);
}

function main(): void {
  const shouldMerge = process.argv.includes("--merge");
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const branch = currentBranch();
  if (!branch.startsWith("feature/")) {
    console.error(`[merge-feature] Must be on feature/* (current: ${branch}).`);
    process.exit(1);
  }

  console.log(`[merge-feature] Promoting ${branch} → dev`);

  console.log("[merge-feature] Running npm audit...");
  runInherit("npm", ["audit", "--audit-level=low"]);

  console.log("[merge-feature] Validating Jira keys in commits...");
  runInherit("npx", ["tsx", "scripts/validate-jira-commits.ts", "--range", `origin/dev...HEAD`, "--branch", branch]);

  console.log("[merge-feature] Pushing to origin...");
  runInherit("git", ["push", "-u", "origin", "HEAD"]);

  let pull = findOpenPr(branch);
  if (pull) {
    console.log(`[merge-feature] Open PR already exists: ${pull.url}`);
  } else {
    console.log("[merge-feature] Creating pull request...");
    runInherit("gh", ["pr", "create", "--base", "dev", "--fill"]);
    pull = findOpenPr(branch);
  }

  if (!pull) {
    console.error("[merge-feature] Could not find or create a pull request.");
    process.exit(1);
  }

  console.log(`[merge-feature] PR ready: ${pull.url}`);

  if (shouldMerge) {
    waitForChecks(pull.number);
    console.log("[merge-feature] Merging pull request...");
    runInherit("gh", ["pr", "merge", String(pull.number), "--merge"]);
    console.log("[merge-feature] Merged to dev.");
  } else {
    console.log("[merge-feature] Next: merge when CI is green → gh pr merge", pull.number, "--merge");
    console.log("[merge-feature] Or re-run with --merge to wait for checks and merge automatically.");
  }
}

main();
