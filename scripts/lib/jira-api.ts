/**
 * Shared Jira REST API helpers for CI status sync scripts.
 */
import { loadEnvLocal } from "./load-env-local";

export interface JiraTransition {
  id: string;
  name: string;
}

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  token: string;
}

export interface JiraIssueStatus {
  name: string;
  statusCategoryKey: string;
}

/** Load Jira credentials from environment or return null when not configured. */
export function loadJiraCredentials(): JiraCredentials | null {
  loadEnvLocal();

  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  return { baseUrl, email, token };
}

function jiraAuthHeader(email: string, token: string): string {
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

/** Perform an authenticated Jira REST API request. */
export async function jiraFetch(
  credentials: JiraCredentials,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${credentials.baseUrl.replace(/\/$/, "")}/rest/api/3${path}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", jiraAuthHeader(credentials.email, credentials.token));
  headers.set("Accept", "application/json");
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...init, headers });
}

/** Read the current workflow status for an issue. */
export async function getIssueStatus(
  credentials: JiraCredentials,
  issueKey: string,
): Promise<JiraIssueStatus> {
  const response = await jiraFetch(
    credentials,
    `/issue/${issueKey}?fields=status`,
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load status for ${issueKey}: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    fields?: {
      status?: {
        name?: string;
        statusCategory?: { key?: string };
      };
    };
  };

  return {
    name: data.fields?.status?.name ?? "Unknown",
    statusCategoryKey: data.fields?.status?.statusCategory?.key ?? "new",
  };
}

/** Returns null when the issue does not exist or is not visible to the API token. */
export async function tryGetIssueStatus(
  credentials: JiraCredentials,
  issueKey: string,
): Promise<JiraIssueStatus | null> {
  const response = await jiraFetch(
    credentials,
    `/issue/${issueKey}?fields=status`,
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load status for ${issueKey}: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    fields?: {
      status?: {
        name?: string;
        statusCategory?: { key?: string };
      };
    };
  };

  return {
    name: data.fields?.status?.name ?? "Unknown",
    statusCategoryKey: data.fields?.status?.statusCategory?.key ?? "new",
  };
}

/** List available workflow transitions for an issue. */
export async function getTransitions(
  credentials: JiraCredentials,
  issueKey: string,
): Promise<JiraTransition[]> {
  const response = await jiraFetch(credentials, `/issue/${issueKey}/transitions`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to load transitions for ${issueKey}: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { transitions?: JiraTransition[] };
  return data.transitions ?? [];
}

/** Resolve a named transition, with partial matching fallback. */
export function findTransition(
  transitions: JiraTransition[],
  targetName: string,
): JiraTransition | null {
  const exact = transitions.find(
    (transition) => transition.name.toLowerCase() === targetName.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  return (
    transitions.find((transition) =>
      transition.name.toLowerCase().includes(targetName.toLowerCase()),
    ) ?? null
  );
}

/** Ordered workflow columns for promotion-only transitions (no demotion). */
const STATUS_ORDER = ["to do", "in progress", "in review", "done"];

function statusRank(name: string): number {
  const index = STATUS_ORDER.indexOf(name.toLowerCase());
  return index >= 0 ? index : -1;
}

/**
 * Return true when an issue should be skipped because it is already done
 * or already at/ past the requested target status.
 */
export function shouldSkipTransition(
  currentStatus: JiraIssueStatus,
  targetStatusName: string,
): boolean {
  if (currentStatus.statusCategoryKey === "done") {
    return true;
  }

  if (currentStatus.name.toLowerCase() === targetStatusName.toLowerCase()) {
    return true;
  }

  const currentRank = statusRank(currentStatus.name);
  const targetRank = statusRank(targetStatusName);
  return currentRank >= 0 && targetRank >= 0 && currentRank > targetRank;
}

/** Apply a workflow transition to an issue. */
export async function applyTransition(
  credentials: JiraCredentials,
  issueKey: string,
  transitionId: string,
): Promise<void> {
  const response = await jiraFetch(credentials, `/issue/${issueKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to transition ${issueKey}: ${response.status} ${body}`);
  }
}

/**
 * Transition an issue to a named status when available.
 * Skips issues that are already done or already at the target status.
 */
export async function transitionIssueToStatus(
  credentials: JiraCredentials,
  issueKey: string,
  targetStatusName: string,
): Promise<"transitioned" | "skipped" | "unavailable"> {
  const current = await tryGetIssueStatus(credentials, issueKey);
  if (!current) {
    console.warn(`[jira-sync] ${issueKey} not found; skipping.`);
    return "unavailable";
  }

  if (shouldSkipTransition(current, targetStatusName)) {
    console.log(`[jira-sync] ${issueKey} already "${current.name}"; skipping.`);
    return "skipped";
  }

  const transition = findTransition(
    await getTransitions(credentials, issueKey),
    targetStatusName,
  );

  if (!transition) {
    console.warn(
      `[jira-sync] No "${targetStatusName}" transition available for ${issueKey} (current: ${current.name}).`,
    );
    return "unavailable";
  }

  await applyTransition(credentials, issueKey, transition.id);
  console.log(`[jira-sync] ${issueKey} → ${transition.name}`);
  return "transitioned";
}
