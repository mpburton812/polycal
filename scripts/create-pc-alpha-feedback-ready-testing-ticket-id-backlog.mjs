/**
 * Creates PC epic + tasks for Alpha Feedback: Ready For Testing status + ticket IDs.
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

if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
  throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN in .env.local");
}

const epic = await jira("issue", {
  fields: {
    project: { key: "PC" },
    summary: "Alpha Feedback: Ready For Testing status + stable ticket IDs",
    issuetype: { name: "Epic" },
    description: doc(
      "Add Ready For Testing status across schema/UI; assign permanent human-visible ticket numbers (#N) shown as the first column in active and archive lists; rebuild tracker MSI.",
    ),
    labels: ["REQ-AFB-STATUS-TICKET-001"],
  },
});
console.log("EPIC", epic.key);

for (const [summary, description, label] of [
  [
    "Alpha Feedback: add Ready For Testing status",
    "Add ready_for_testing to status enums/Zod/labels; selectable in tracker detail UI for active and archive workflows; existing tickets still load.",
    "REQ-AFB-STATUS-001",
  ],
  [
    "Alpha Feedback: stable human-visible ticket IDs",
    "Persist unique auto-increment ticket_number; backfill existing rows by creation order; expose in admin list/detail APIs; show as first column (#N) in active and archive tables.",
    "REQ-AFB-TICKET-ID-001",
  ],
  [
    "Alpha Feedback tracker: rebuild Windows MSI",
    "After UI/API wiring, run tauri:build and ship artifacts under src-tauri/target/release/bundle/.",
    "REQ-AFB-MSI-001",
  ],
]) {
  const issue = await jira("issue", {
    fields: {
      project: { key: "PC" },
      summary,
      issuetype: { name: "Task" },
      parent: { key: epic.key },
      description: doc(description),
      labels: [label],
    },
  });
  console.log(issue.key, summary);
}
