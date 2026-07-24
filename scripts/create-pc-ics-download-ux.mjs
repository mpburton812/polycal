/**
 * Creates a Story under PC-337 for ICS download UX on cards + inbox + journey.
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
  throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN");
}

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    fields: {
      project: { key: "PC" },
      parent: { key: "PC-337" },
      summary: "ICS download on resolved cards + inbox + journey",
      issuetype: { name: "Story" },
      labels: ["REQ-CAL-ICS-UX"],
      description: doc(
        "Show Download ICS on resolved kanban ProposalCard and ProposalDetailDialog when the user has an ICS file for that proposal (button remains after first download). Notification copy: You have a calendar ics available for the event : [name]. Inbox Download ICS button. Journey asserts ICS content matches PolyCal.",
      ),
    },
  }),
});

const text = await res.text();
if (!res.ok) throw new Error(`${res.status} ${text}`);
const issue = JSON.parse(text);
console.log(issue.key);
