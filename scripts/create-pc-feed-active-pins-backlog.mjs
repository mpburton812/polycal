/**
 * Creates PC Epic + tasks for Feed active-event pins and notify/log actor attribution.
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
    summary: "Feed active-event pins + notify/log actor attribution",
    issuetype: { name: "Epic" },
    labels: ["REQ-FEED-ACTIVE-001"],
    description: doc(
      "Pin currently-happening non-sleeping events atop the Feed with sticky highlight cards. Fix hardcoded An admin / administrator notify copy and system-log User mis-attribution for notification.* rows (recipient vs actor). Promote through test to production.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Feed: pin happening-now events with sticky highlight",
    "isEventHappeningNow helper; listFeedItemsAction returns activeEvents; sticky Happening now stack in FeedClient; silent-poll token includes actives. Labels: REQ-FEED-ACTIVE-002",
  ],
  [
    "Notify + system log: name actors not roles/recipients",
    "Replace An admin deleted / rescheduled by an administrator with displayName; actorUserId/actorDisplayName on human notifies; admin activity log User prefers actor for notification.*; related place-delete/attendee/vote/slice-detach naming. Labels: REQ-FEED-ACTIVE-003",
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
