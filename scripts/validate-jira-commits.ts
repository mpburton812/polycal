#!/usr/bin/env npx tsx
/**
 * Validate that commits on feature/* branches include a Jira key (PC-xxx).
 *
 * Used by:
 *   - .husky/commit-msg (single commit being created)
 *   - CI pipelines (all commits in a push or merge request)
 *
 * Usage:
 *   npx tsx scripts/validate-jira-commits.ts              # validate HEAD only
 *   npx tsx scripts/validate-jira-commits.ts --range dev...HEAD
 *   npx tsx scripts/validate-jira-commits.ts --file .git/COMMIT_EDITMSG
 */
import { readFileSync } from "node:fs";
import {
  currentBranch,
  extractJiraKey,
  git,
  isFeatureBranch,
  shortSha,
} from "./lib/requirements";
import { jiraKeyExample, jiraKeyLabel } from "./lib/workflow-config";

interface CliOptions {
  range?: string;
  file?: string;
  branch?: string;
}

interface CommitUnderTest {
  sha: string;
  subject: string;
  body: string;
  branch: string;
}

/** Parse simple --key value CLI arguments. */
function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--range") {
      options.range = argv[++index];
    } else if (arg === "--file") {
      options.file = argv[++index];
    } else if (arg === "--branch") {
      options.branch = argv[++index];
    }
  }

  return options;
}

/** True for automated merge commits that should not require Jira keys. */
function isMergeCommit(sha: string): boolean {
  const parents = git(["rev-list", "--parents", "-n", "1", sha]).split(" ");
  return parents.length > 2;
}

/** Load commit metadata for validation. */
function loadCommit(sha: string, branch: string): CommitUnderTest {
  return {
    sha,
    subject: git(["log", "-1", "--format=%s", sha]),
    body: git(["log", "-1", "--format=%B", sha]),
    branch,
  };
}

/** List non-merge commit SHAs in a git revision range. */
function commitsInRange(range: string): string[] {
  const output = git(["rev-list", "--no-merges", range]);
  return output ? output.split("\n").filter(Boolean) : [];
}

/** Validate one commit message contains PC-xxx when on a feature branch. */
function validateCommit(commit: CommitUnderTest): string | null {
  if (!isFeatureBranch(commit.branch)) {
    return null;
  }

  if (isMergeCommit(commit.sha)) {
    return null;
  }

  const message = `${commit.subject}\n${commit.body}`;
  if (extractJiraKey(message)) {
    return null;
  }

  return (
    `Commit ${shortSha(commit.sha)} on ${commit.branch} is missing a Jira key (${jiraKeyLabel()}).\n` +
    `  Subject: ${commit.subject}\n` +
    `  Example: feat(calendar): add weekly view ${jiraKeyExample()}`
  );
}

function main(): void {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const options = parseArgs(process.argv.slice(2));
  const branch = options.branch ?? currentBranch();
  const errors: string[] = [];

  if (options.file) {
    const message = readFileSync(options.file, "utf8");
    if (isFeatureBranch(branch) && !extractJiraKey(message)) {
      errors.push(
        `Commit message on ${branch} is missing a Jira key (${jiraKeyLabel()}).\n` +
          `  Example: feat(calendar): add weekly view ${jiraKeyExample()}`,
      );
    }
  } else if (options.range) {
    for (const sha of commitsInRange(options.range)) {
      const error = validateCommit(loadCommit(sha, branch));
      if (error) {
        errors.push(error);
      }
    }
  } else {
    const sha = git(["rev-parse", "HEAD"]);
    const error = validateCommit(loadCommit(sha, branch));
    if (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    console.error("[validate-jira] Jira key validation failed:\n");
    for (const error of errors) {
      console.error(`  - ${error.replace(/\n/g, "\n    ")}\n`);
    }
    process.exit(1);
  }

  console.log(`[validate-jira] All checked commits include a Jira key (${jiraKeyLabel()}).`);
}

main();
