/**
 * Creates PC Epic + tasks for Unified Feed v2 (PC-231).
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
    summary: "Unified Feed v2 — timeline, comments, images, reply push",
    issuetype: { name: "Epic" },
    labels: ["REQ-FEED-V2"],
    description: doc(
      "Merge milestones+chat into one Option A timeline with bottom composer; chat comments (author/message-author/admin delete); milestone comments (author/proposer/admin); multi-image; feed.chat_reply push to message author only; exclude archived milestones.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  ["Unified feed API + exclude archived milestones", "listFeedItemsAction merge; FILTER archived; SCHEMA 26. REQ-FEED-V2-API"],
  ["Feed UI Option A + bottom composer", "Single timeline left-rail chips; fixed bottom composer. REQ-FEED-V2-UI"],
  ["Chat comments + delete rules", "network_chat_comments; delete by author/message author/admin. REQ-FEED-V2-CHAT-CMT"],
  ["Milestone comments + delete in feed", "Inline proposal comments; delete author/proposer/admin. REQ-FEED-V2-MS-CMT"],
  ["Multi-image upload, thumbnails, lightbox", "Junction tables; /api/feed-images; lightbox. REQ-FEED-V2-IMG"],
  ["Push feed.chat_reply author-only + prefs", "notifyUser feed_chat_reply; feedChatReplies pref. REQ-FEED-V2-PUSH"],
  ["E2E + unit coverage for unified Feed", "feed.spec composer+reply; pref migration tests. REQ-FEED-V2-E2E"],
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
