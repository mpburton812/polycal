/**
 * Creates PC Epic + tasks for Feed tab and sleeping network visibility.
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
    summary: "Feed tab & sleeping network visibility",
    issuetype: { name: "Epic" },
    labels: ["REQ-FEED-001"],
    description: doc(
      "Add leftmost Feed bottom tab (proposal lifecycle milestones + comments + network chat). Add admin sleepingNetworkVisibility (everyone vs involved) orthogonal to hideSleepingArrangements, respecting private/super-private.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Feed bottom tab shell + routing (leftmost, default landing)",
    "Add /feed as first MAIN_TAB_HREF; AppTabs/TabSwipeRegion; page + FeedClient; post-login and fallbacks land on /feed. Labels: REQ-FEED-002",
  ],
  [
    "Milestone feed API + privacy filtering",
    "listFeedMilestonesAction from proposal_state_log with curated actions; apply viewerCanSeeProposal + sleepingNetworkVisibility + auditLogVisibility. Labels: REQ-FEED-003",
  ],
  [
    "Feed UI milestones with comments and proposal open CTA",
    "Milestone cards with comments via proposal_comments; open ProposalDetailDialog. Labels: REQ-FEED-004",
  ],
  [
    "Network-wide chat schema API and UI",
    "network_chat_messages table; list/post/delete actions; Feed Chat section with poll refresh. Labels: REQ-FEED-005",
  ],
  [
    "Admin sleepingNetworkVisibility + enforcement",
    "everyone|involved setting; enforce on board, detail, schedule, feed; keep hideSleepingArrangements. Labels: REQ-SLEEP-001",
  ],
  [
    "Feed and sleeping visibility unit + Playwright tests",
    "Visibility matrix unit tests; e2e navigation/feed/chat/sleeping toggle coverage. Labels: REQ-FEED-006",
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
  console.log(issue.key, summary);
}
