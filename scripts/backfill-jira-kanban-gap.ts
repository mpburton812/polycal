#!/usr/bin/env npx tsx
/**
 * Backfill Jira issues PC-52..PC-56 and align Kanban statuses with git delivery.
 *
 * Usage:
 *   npx tsx scripts/backfill-jira-kanban-gap.ts
 *
 * Requires JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.
 */
import {
  getIssueStatus,
  jiraFetch,
  loadJiraCredentials,
  transitionIssueToStatus,
} from "./lib/jira-api";

const PROJECT_KEY = "PC";
const TARGET_MAX = 56;

interface TicketDef {
  summary: string;
  description: string;
  targetStatus: "To Do" | "In Progress" | "In Review" | "Done";
}

/** Delivery log summaries for the PC-52..PC-56 gap (keys assigned sequentially by Jira). */
const TICKETS_BY_NUMBER: Record<number, TicketDef> = {
  52: {
    summary: "Burton-Thompson test seed and admin user provisioning E2E",
    description:
      "Test environment scripts, Burton-Thompson seed, admin user provisioning Playwright journey, and first-login onboarding wizard fix.",
    targetStatus: "Done",
  },
  53: {
    summary: "Launch ops gaps and proposal UX fixes",
    description:
      "Pending-recovery TTL, schedule heatmap, Resend email delivery, admin gender column, sleeping date-only UX, activity log, attendee votes, and zero-required-invitee guard.",
    targetStatus: "Done",
  },
  54: {
    summary: "Backlog alignment slot (no standalone delivery)",
    description:
      "Reserved sequential Jira key between PC-53 and PC-55; no commits reference PC-54.",
    targetStatus: "Done",
  },
  55: {
    summary: "Calendar month view, paused users, and E2E journeys",
    description:
      "Schedule opens on current week; month view with icons and multi-day bars; paused users see /paused; bad_user admin lifecycle and solo comment E2E journeys. Merged to dev via PR #90.",
    targetStatus: "Done",
  },
  56: {
    summary: "Residency Kanban workflow, toast UX, and schedule polish",
    description:
      "Place residency and sleeping partnerships on Proposals Kanban; toast notifications; Enter posts comments; heatmap and event card format polish; residency and sleeping E2E journeys. Open PR #91.",
    targetStatus: "In Review",
  },
};

function parseIssueNumber(issueKey: string): number | null {
  const match = issueKey.match(/^PC-(\d+)$/i);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
}

/** Probe sequential keys — more reliable than JQL search with restricted tokens. */
async function getLatestIssueNumber(
  credentials: NonNullable<ReturnType<typeof loadJiraCredentials>>,
): Promise<number> {
  for (let number = TARGET_MAX; number >= 1; number -= 1) {
    if (await issueExists(credentials, `${PROJECT_KEY}-${number}`)) {
      return number;
    }
  }
  return 0;
}

/** Create the next sequential Story in project PC. */
async function createStory(
  credentials: NonNullable<ReturnType<typeof loadJiraCredentials>>,
  definition: TicketDef,
): Promise<string> {
  const response = await jiraFetch(credentials, "/issue", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        project: { key: PROJECT_KEY },
        summary: definition.summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: definition.description }],
            },
          ],
        },
        issuetype: { name: "Story" },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create Jira story: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { key?: string };
  if (!data.key) {
    throw new Error("Jira create issue response missing key.");
  }

  return data.key;
}

async function issueExists(
  credentials: NonNullable<ReturnType<typeof loadJiraCredentials>>,
  issueKey: string,
): Promise<boolean> {
  const response = await jiraFetch(credentials, `/issue/${issueKey}?fields=summary`);
  return response.ok;
}

/** Sample known keys to produce actionable auth/project diagnostics. */
async function describeJiraAccess(
  credentials: NonNullable<ReturnType<typeof loadJiraCredentials>>,
): Promise<string> {
  const samples = ["PC-1", "PC-51", "PC-55"];
  const results: string[] = [];
  for (const issueKey of samples) {
    const response = await jiraFetch(credentials, `/issue/${issueKey}?fields=summary`);
    results.push(`${issueKey}=${response.status}`);
  }
  return results.join(", ");
}

async function main(): Promise<void> {
  const credentials = loadJiraCredentials();
  if (!credentials) {
    throw new Error(
      "Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN before running backfill.",
    );
  }

  let latest = await getLatestIssueNumber(credentials);
  console.log(`[jira-backfill] Latest ${PROJECT_KEY} issue: ${latest > 0 ? `${PROJECT_KEY}-${latest}` : "none"}`);

  if (latest === 0) {
    const access = await describeJiraAccess(credentials);
    console.warn(
      `[jira-backfill] No visible ${PROJECT_KEY} issues (${access}). Attempting sequential create from ${PROJECT_KEY}-52…`,
    );
    latest = 51;
  }

  if (latest < 51) {
    throw new Error(
      `Latest ${PROJECT_KEY} issue is ${PROJECT_KEY}-${latest}; expected PC-51 or higher before backfilling PC-52..PC-56.`,
    );
  }

  while (latest < TARGET_MAX) {
    const nextNumber = latest + 1;
    const definition = TICKETS_BY_NUMBER[nextNumber];
    if (!definition) {
      throw new Error(`Missing ticket definition for ${PROJECT_KEY}-${nextNumber}.`);
    }

    console.log(`[jira-backfill] Creating ${PROJECT_KEY}-${nextNumber}: ${definition.summary}`);
    const createdKey = await createStory(credentials, definition);
    const createdNumber = parseIssueNumber(createdKey);
    if (createdNumber !== nextNumber) {
      throw new Error(
        `Expected ${PROJECT_KEY}-${nextNumber} but Jira created ${createdKey}.`,
      );
    }
    latest = nextNumber;
  }

  for (let number = 52; number <= TARGET_MAX; number += 1) {
    const issueKey = `${PROJECT_KEY}-${number}`;
    const definition = TICKETS_BY_NUMBER[number];
    if (!definition) continue;

    const exists = await issueExists(credentials, issueKey);
    if (!exists) {
      console.warn(`[jira-backfill] ${issueKey} still missing after create loop; skipping transition.`);
      continue;
    }

    const current = await getIssueStatus(credentials, issueKey);
    console.log(`[jira-backfill] ${issueKey} is "${current.name}" → target "${definition.targetStatus}"`);
    await transitionIssueToStatus(credentials, issueKey, definition.targetStatus);
  }

  console.log("[jira-backfill] Kanban gap backfill complete.");
}

main().catch((error: unknown) => {
  console.error("[jira-backfill] Failed:", error);
  process.exit(1);
});
