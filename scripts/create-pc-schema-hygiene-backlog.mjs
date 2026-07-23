/**
 * Creates PC Epic + tasks for schema hygiene (simplify Epic 5).
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
    summary: "Schema hygiene: stop ensuring dead columns (simplify Epic 5)",
    issuetype: { name: "Epic" },
    labels: ["REQ-SIMPLIFY-040"],
    description: doc(
      "Stop ensureColumn for PC-280 dead poly_group columns and orphan *_hours columns on new installs; guard pc280/hours-to-days migrations when columns missing; bump SCHEMA_VERSION; sync verify script. Do not DROP columns or redesign batch JSON.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Stop ensuring PC-280 dead + orphan hour columns",
    "REQ-SIMPLIFY-041. Remove ensureColumn for dead privacy/power columns and recovery/proposed/at_risk hour columns; guard migrations if columns absent.",
  ],
  [
    "SCHEMA_VERSION bump + verify script sync",
    "REQ-SIMPLIFY-042. Bump SCHEMA_VERSION; update migrate tests and verify-turso-schema.mjs; optional Drizzle schema cleanup of dead fields.",
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
