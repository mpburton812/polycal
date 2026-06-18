#!/usr/bin/env npx tsx
/**
 * Transition Jira issues referenced in a merged commit range to Done.
 *
 * Skips gracefully when Jira credentials are not configured (local dev).
 *
 * Required env (CI / manual):
 *   JIRA_BASE_URL   e.g. https://mpburton.atlassian.net
 *   JIRA_EMAIL      Atlassian account email
 *   JIRA_API_TOKEN  Atlassian API token
 *
 * Optional env:
 *   JIRA_DONE_TRANSITION_NAME  default: "Done"
 *
 * Usage:
 *   npx tsx scripts/jira-transition-on-merge.ts --range abc..def
 */
import { git, jiraKeysInRange } from "./lib/requirements";

interface Transition {
  id: string;
  name: string;
}

function parseRange(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--range") {
      return argv[index + 1];
    }
  }

  throw new Error("Missing required --range argument.");
}

function jiraAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

async function jiraFetch(
  baseUrl: string,
  email: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/api/3${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", jiraAuthHeader(email, token));
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...init, headers });
}

async function getDoneTransition(
  baseUrl: string,
  email: string,
  token: string,
  issueKey: string,
  doneName: string,
): Promise<Transition | null> {
  const response = await jiraFetch(baseUrl, email, token, `/issue/${issueKey}/transitions`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load transitions for ${issueKey}: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { transitions?: Transition[] };
  const transitions = data.transitions ?? [];
  const exact = transitions.find(
    (transition) => transition.name.toLowerCase() === doneName.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  return (
    transitions.find((transition) => transition.name.toLowerCase().includes("done")) ?? null
  );
}

async function transitionIssue(
  baseUrl: string,
  email: string,
  token: string,
  issueKey: string,
  transitionId: string,
): Promise<void> {
  const response = await jiraFetch(baseUrl, email, token, `/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to transition ${issueKey}: ${response.status} ${body}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  process.chdir(repoRoot);

  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const doneName = process.env.JIRA_DONE_TRANSITION_NAME ?? "Done";

  if (!baseUrl || !email || !token) {
    console.log(
      "[jira-sync] Skipping — set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN to enable.",
    );
    return;
  }

  const range = parseRange(process.argv.slice(2));
  const keys = jiraKeysInRange(range);

  if (keys.length === 0) {
    console.log(`[jira-sync] No PC-xxx keys found in range: ${range}`);
    return;
  }

  console.log(`[jira-sync] Transitioning ${keys.length} issue(s) to "${doneName}"...`);

  for (const issueKey of keys) {
    const transition = await getDoneTransition(baseUrl, email, token, issueKey, doneName);
    if (!transition) {
      console.warn(`[jira-sync] No Done transition available for ${issueKey}; skipping.`);
      continue;
    }

    await transitionIssue(baseUrl, email, token, issueKey, transition.id);
    console.log(`[jira-sync] ${issueKey} → ${transition.name}`);
  }
}

main().catch((error: unknown) => {
  console.error("[jira-sync] Failed:", error);
  process.exit(1);
});
