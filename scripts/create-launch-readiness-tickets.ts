#!/usr/bin/env npx tsx
/**
 * Create Post-launch readiness Epic + P0/P1 stories in Jira project PC.
 *
 * Usage:
 *   npx tsx scripts/create-launch-readiness-tickets.ts
 *
 * Requires JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN.
 */
import { jiraFetch, loadJiraCredentials, tryGetIssueStatus } from "./lib/jira-api";

const LAUNCH_EPIC_KEY = "PC-57";

const PROJECT_KEY = "PC";

interface TicketSpec {
  summary: string;
  description: string;
  issueType: "Epic" | "Story" | "Task";
}

const LAUNCH_TICKETS: TicketSpec[] = [
  {
    issueType: "Epic",
    summary: "Post-launch readiness (PC-57)",
    description:
      "Operational and feature gaps after promoting PC-56 to test and production. Tracks P0 launch blockers and P1 enhancements.",
  },
  {
    issueType: "Task",
    summary: "[P0] Fix GitHub Actions Jira credentials and backfill PC-52..56",
    description:
      "GitHub Actions Jira sync returns 404 for all PC issues (PC-1=404). Verify JIRA_BASE_URL=https://mpburton.atlassian.net, JIRA_EMAIL, and JIRA_API_TOKEN in GitHub secrets. Run scripts/backfill-jira-kanban-gap.ts to create PC-52..PC-56 and align Kanban statuses (Done for 52-55, In Review for 56).",
  },
  {
    issueType: "Task",
    summary: "[P0] Production smoke-test checklist and prod admin verification",
    description:
      "After production promotion: verify Turso polycal-prod migrations, Vercel env vars (TURSO_*, AUTH_SECRET, AUTH_URL, NEXT_PUBLIC_APP_ENV=production), login flow, Schedule/Proposals/Admin smoke paths. Confirm prod admin exists via scripts/create-prod-admin.mjs or admin query; document results.",
  },
  {
    issueType: "Story",
    summary: "[P1] SMS and push notification hardening",
    description:
      "Onboarding shows SMS as coming later. Implement SMS channel (Twilio or equivalent), harden Web Push delivery, audible/device alerts, and wire notification prefs to real delivery paths beyond inbox + Resend email stub.",
  },
  {
    issueType: "Story",
    summary: "[P1] Partner max nights and batch sleeping schedule display",
    description:
      "Implement Sunday–Saturday partner max-night warnings with pronoun-aware copy. Show proposed batch sleeping nights on Schedule in yellow tentative styling. Fix any batch sleeping local-calendar off-by-one issues.",
  },
];

async function createIssue(
  credentials: NonNullable<ReturnType<typeof loadJiraCredentials>>,
  spec: TicketSpec,
): Promise<string> {
  const response = await jiraFetch(credentials, "/issue", {
    method: "POST",
    body: JSON.stringify({
      fields: {
        project: { key: PROJECT_KEY },
        summary: spec.summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: spec.description }],
            },
          ],
        },
        issuetype: { name: spec.issueType },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to create "${spec.summary}": ${response.status} ${body}`);
  }

  const data = (await response.json()) as { key?: string };
  if (!data.key) {
    throw new Error(`Create response missing key for "${spec.summary}".`);
  }
  return data.key;
}

async function main(): Promise<void> {
  const credentials = loadJiraCredentials();
  if (!credentials) {
    throw new Error(
      [
        "Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN before creating launch tickets.",
        "Add them to .env.local in the project root, or export them in your shell.",
        "Example .env.local:",
        "  JIRA_BASE_URL=https://mpburton.atlassian.net",
        "  JIRA_EMAIL=you@example.com",
        "  JIRA_API_TOKEN=<atlassian-api-token>",
      ].join("\n"),
    );
  }

  const existingEpic = await tryGetIssueStatus(credentials, LAUNCH_EPIC_KEY);
  if (existingEpic) {
    console.log(
      `[jira-launch] ${LAUNCH_EPIC_KEY} already exists (${existingEpic.name}); skipping create.`,
    );
    return;
  }

  console.log(`[jira-launch] Creating ${LAUNCH_TICKETS.length} issue(s) in ${PROJECT_KEY}…`);

  const created: string[] = [];
  for (const spec of LAUNCH_TICKETS) {
    const key = await createIssue(credentials, spec);
    created.push(key);
    console.log(`[jira-launch] ${key} — ${spec.summary}`);
  }

  console.log("[jira-launch] Done:", created.join(", "));
}

main().catch((error: unknown) => {
  console.error("[jira-launch] Failed:", error);
  process.exit(1);
});
