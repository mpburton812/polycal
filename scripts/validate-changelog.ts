#!/usr/bin/env npx tsx
/**
 * Ensures CHANGELOG.md [Unreleased] documents every Jira key in feature commits.
 * Used by merge-feature and CI before promoting feature/* → dev.
 */
import { readProjectChangelog, unreleasedSectionCoversJiraKeys } from "../src/lib/changelog";
import { extractJiraKey, git, isFeatureBranch } from "./lib/requirements";

function parseArgs(argv: string[]): { range?: string; branch?: string } {
  const options: { range?: string; branch?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--range") {
      options.range = argv[++index];
    } else if (argv[index] === "--branch") {
      options.branch = argv[++index];
    }
  }
  return options;
}

function commitsInRange(range: string): string[] {
  const output = git(["rev-list", "--no-merges", range]);
  return output ? output.split("\n").filter(Boolean) : [];
}

function jiraKeysFromRange(range: string): string[] {
  const keys = new Set<string>();
  for (const sha of commitsInRange(range)) {
    const subject = git(["log", "-1", "--format=%s", sha]);
    const body = git(["log", "-1", "--format=%B", sha]);
    const key = extractJiraKey(`${subject}\n${body}`);
    if (key) keys.add(key);
  }
  return [...keys];
}

function main(): void {
  const { range = "origin/dev...HEAD", branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) } =
    parseArgs(process.argv.slice(2));

  const promotionBranch = "feature/promotion";
  if (!isFeatureBranch(branch) && branch !== promotionBranch) {
    console.log("[validate-changelog] Skipping — not on feature/*");
    return;
  }

  const keys = jiraKeysFromRange(range);
  if (keys.length === 0) {
    console.log("[validate-changelog] No Jira keys in commit range; skipping.");
    return;
  }

  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  const markdown = readProjectChangelog(repoRoot);

  if (!unreleasedSectionCoversJiraKeys(markdown, keys)) {
    const missing = keys.filter(
      (key) => !unreleasedSectionCoversJiraKeys(markdown, [key]),
    );
    console.error(
      `[validate-changelog] CHANGELOG.md [Unreleased] must mention: ${missing.join(", ")}`,
    );
    console.error(
      "[validate-changelog] Add a bullet under ## [Unreleased] before promoting.",
    );
    process.exit(1);
  }

  console.log(
    `[validate-changelog] OK — [Unreleased] documents ${keys.join(", ")}`,
  );
}

main();
