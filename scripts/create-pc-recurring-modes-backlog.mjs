/**
 * Creates PC tickets for recurring schedule modes + env banner restore.
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
    summary: "Event schedule modes: Window/All Day × Recurring + env banners",
    issuetype: { name: "Epic" },
    description: doc(
      "Allow Window, All Day, Recurring, Window+Recurring, All Day+Recurring. Move recurrence configurator below date fields. Restore DEV red / TEST yellow environment banners.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Draft modes: Window/All Day/Poll exclusive; Recurring combines",
    "Schedule type UI allows Recurring with Window or All Day; Poll still exclusive of Recurring.",
  ],
  [
    "Recurrence configurator below date fields",
    "When Recurring is on, show pattern/occurrences under date (or date+time for Window), not in More options.",
  ],
  [
    "Restore DEV red and TEST yellow environment banners",
    "Re-mount DevBar / environment banner in AppShell for non-production (and production green if previously shown).",
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
