/**
 * Creates PC task for batch sleeping per-night calendar sync + title cleanup.
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

async function createIssue(fields) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text).key;
}

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const key = await createIssue({
  project: { key: "PC" },
  summary: "Batch sleeping: per-night Google/ICS events; drop Confirmed; LOCATION field",
  issuetype: { name: "Task" },
  labels: ["REQ-CAL-BATCH-NIGHTS-001"],
  description: doc(
    "REQ-CAL-BATCH-NIGHTS-001: Sync each batch sleeping night as its own all-day free Google/ICS event (single multi-day sleeping stays one span). Omit Confirmed from resolved titles but keep ', at Location'. Set LOCATION field. calendar_event_links.night_key (SCHEMA 37). Sync nights only for proposer/invitees on that night.",
  ),
});
console.log(key);
