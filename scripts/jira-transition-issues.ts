#!/usr/bin/env npx tsx
/**
 * Transition Jira issues referenced in a git range to a target workflow status.
 *
 * Usage:
 *   npx tsx scripts/jira-transition-issues.ts --range origin/dev...HEAD --status "In Review"
 *   npx tsx scripts/jira-transition-issues.ts --range abc..def --status Done
 */
import { git, jiraKeysInRange } from "./lib/requirements";
import { loadJiraCredentials, transitionIssueToStatus } from "./lib/jira-api";

function parseArgs(argv: string[]): { range: string; status: string } {
  let range: string | undefined;
  let status: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--range") {
      range = argv[++index];
    } else if (arg === "--status") {
      status = argv[++index];
    }
  }

  if (!range || !status) {
    throw new Error('Usage: jira-transition-issues.ts --range <range> --status "<status name>"');
  }

  return { range, status };
}

async function main(): Promise<void> {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const credentials = loadJiraCredentials();
  if (!credentials) {
    console.log(
      "[jira-sync] Skipping — set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN to enable.",
    );
    return;
  }

  const { range, status } = parseArgs(process.argv.slice(2));
  const keys = jiraKeysInRange(range);

  if (keys.length === 0) {
    console.log(`[jira-sync] No PC-xxx keys found in range: ${range}`);
    return;
  }

  console.log(`[jira-sync] Transitioning ${keys.length} issue(s) toward "${status}"...`);

  for (const issueKey of keys) {
    await transitionIssueToStatus(credentials, issueKey, status);
  }
}

main().catch((error: unknown) => {
  console.error("[jira-sync] Failed:", error);
  process.exit(1);
});
