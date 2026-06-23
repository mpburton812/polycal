#!/usr/bin/env npx tsx
/**
 * Append a requirement row to .requirements for the latest (or specified) commit.
 *
 * Invoked automatically by the post-commit git hook. Can also be run manually:
 *   npx tsx scripts/append-requirement.ts
 *   npx tsx scripts/append-requirement.ts --sha abc1234
 *   npx tsx scripts/append-requirement.ts --jira PC-42 --summary "Custom summary" --module src/foo.ts
 */
import { join } from "node:path";
import {
  appendEntry,
  cleanCommitSubject,
  currentBranch,
  extractJiraKey,
  formatLogDate,
  git,
  isFeatureBranch,
  pickPrimaryModule,
  shortSha,
} from "./lib/requirements";
import { jiraKeyLabel } from "./lib/workflow-config";

interface CliOptions {
  sha?: string;
  jira?: string;
  summary?: string;
  module?: string;
}

/** Parse simple --key value CLI arguments. */
function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sha") {
      options.sha = argv[++index];
    } else if (arg === "--jira") {
      options.jira = argv[++index];
    } else if (arg === "--summary") {
      options.summary = argv[++index];
    } else if (arg === "--module") {
      options.module = argv[++index];
    }
  }

  return options;
}

/** List files changed in a commit (empty for root commits). */
function changedFilesInCommit(sha: string): string[] {
  try {
    const output = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

function main(): void {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const options = parseArgs(process.argv.slice(2));
  const commitSha = options.sha ?? git(["rev-parse", "HEAD"]);
  const branch = currentBranch();

  const changedFiles = changedFilesInCommit(commitSha);
  if (
    changedFiles.length === 1 &&
    changedFiles[0] === ".requirements" &&
    !options.jira
  ) {
    console.log("[requirements] Skipping append for requirements-only commit.");
    return;
  }

  // Only feature branches participate in the requirement log workflow.
  if (!isFeatureBranch(branch)) {
    console.log(`[requirements] Skipping append on branch "${branch}" (not feature/*).`);
    return;
  }

  const commitMessage = git(["log", "-1", "--format=%B", commitSha]);
  const jiraKey = options.jira ?? extractJiraKey(commitMessage);

  if (!jiraKey) {
    console.warn(
      `[requirements] No Jira key (${jiraKeyLabel()}) found for ${shortSha(commitSha)} on ${branch}.`,
    );
    return;
  }

  const subject = git(["log", "-1", "--format=%s", commitSha]);
  const summary = options.summary ?? cleanCommitSubject(subject);

  if (!summary) {
    console.warn(
      `[requirements] Empty requirement summary for ${shortSha(commitSha)}; use --summary to set one.`,
    );
    return;
  }

  const module = options.module ?? pickPrimaryModule(changedFiles);
  const authorDate = git(["log", "-1", "--format=%aI", commitSha]);
  const date = formatLogDate(new Date(authorDate));

  const appended = appendEntry(repoRoot, {
    date,
    commitSha: shortSha(commitSha),
    jiraKey,
    summary,
    module,
  });

  if (appended) {
    console.log(
      `[requirements] Logged ${jiraKey} (${shortSha(commitSha)}): ${summary}`,
    );
    console.log(
      "[requirements] .requirements was updated. Stage and commit it with your next change.",
    );
  } else {
    console.log(`[requirements] Entry already exists for ${shortSha(commitSha)}.`);
  }
}

main();
