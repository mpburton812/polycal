#!/usr/bin/env npx tsx
/**
 * Print unique Jira keys (PC-xxx) referenced in a git revision range.
 *
 * Usage:
 *   npx tsx scripts/extract-jira-keys-from-range.ts --range origin/dev...HEAD
 */
import { git, jiraKeysInRange } from "./lib/requirements";

function parseRange(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--range") {
      return argv[index + 1];
    }
  }

  throw new Error("Missing required --range argument (e.g. origin/dev...HEAD).");
}

function main(): void {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const range = parseRange(process.argv.slice(2));
  const keys = jiraKeysInRange(range);

  for (const key of keys) {
    console.log(key);
  }
}

main();
