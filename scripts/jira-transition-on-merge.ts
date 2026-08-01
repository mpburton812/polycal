#!/usr/bin/env npx tsx
/** @deprecated Use `jira-transition-issues.ts --status Done` instead. */
import { git, jiraKeysInRange } from "./lib/requirements";
import { loadJiraCredentials, transitionIssueToStatus } from "./lib/jira-api";

function parseRange(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--range") {
      return argv[index + 1];
    }
  }

  throw new Error("Missing required --range argument.");
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

  const range = parseRange(process.argv.slice(2));
  const keys = jiraKeysInRange(range);
  const status = process.env.JIRA_DONE_TRANSITION_NAME ?? "Done";

  for (const issueKey of keys) {
    await transitionIssueToStatus(credentials, issueKey, status);
  }
}

main().catch((error: unknown) => {
  console.error("[jira-sync] Failed:", error);
  process.exit(1);
});
