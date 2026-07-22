/**
 * Creates PC Epic + tasks for Proposed Kanban nudge/timers and admin proposal delete.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  const text = fs.readFileSync(file, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    env[line.slice(0, i)] = line.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...process.env, ...loadEnvLocal() };
const baseUrl = env.JIRA_BASE_URL?.replace(/\/$/, "");
const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64");

if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
  throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN in .env.local");
}

async function jira(apiPath, body) {
  const res = await fetch(`${baseUrl}/rest/api/3/${apiPath}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
}

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const epic = await jira("issue", {
  fields: {
    project: { key: "PC" },
    summary: "Nudge, expiry timers, and admin proposal delete",
    issuetype: { name: "Epic" },
    labels: ["REQ-PROP-NUDGE-001"],
    description: doc(
      "Proposed Kanban: Nudge pending voters; live expiry/at-risk countdowns. Admin hard-delete of proposals in any state (including archived) with participant notify.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Board DTO + proposed/at-risk expiry helpers",
    "Export getProposedExpirationInstant; computeProposedExpiresAt with proposedMaxDays; extend ProposalCard with proposedExpiresAt, atRiskExpiresAt, pendingVoteCount, canNudge, lastNudgeAt. Labels: REQ-PROP-NUDGE-002",
  ],
  [
    "Nudge pending voters action + lastNudgeAt",
    "Schema last_nudge_at; nudgePendingVotersAction with 60m cooldown; notify not_seen invitees as proposal_nudge. Labels: REQ-PROP-NUDGE-003",
  ],
  [
    "ProposalCard Nudge button + expiry countdown UI",
    "Upper-right Nudge on Proposed cards; ProposalExpiryCountdown for proposed and at-risk timers. Labels: REQ-PROP-NUDGE-004",
  ],
  [
    "Admin hard-delete proposal any state + notify",
    "adminDeleteProposalAction for draft|proposed|resolved|archived; occurrence/series; cascade delete; proposal_admin_deleted to all participants. Labels: REQ-PROP-DEL-001",
  ],
  [
    "Nudge timers admin-delete tests and docs",
    "Unit + Playwright; CHANGELOG; USER-MANUAL. Labels: REQ-PROP-NUDGE-005",
  ],
];

for (const [summary, description] of tasks) {
  const issue = await jira("issue", {
    fields: {
      project: { key: "PC" },
      summary,
      issuetype: { name: "Task" },
      parent: { key: epic.key },
      description: doc(description),
    },
  });
  console.log("TASK", issue.key, summary);
}
