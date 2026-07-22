/**
 * Creates PC Epic + tasks for visibility/partners SSOT cleanup (Epic 1).
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
    summary: "Visibility + partners SSOT (simplify Epic 1)",
    issuetype: { name: "Epic" },
    labels: ["REQ-SIMPLIFY-001"],
    description: doc(
      "Consolidate accepted-partner and eligible-location loaders; unify visible/contentMasked policy for schedule/slices; remove dead masked=false scaffolding; one Busy masked title; honest admin label for hideSleepingArrangements. Do not wire calendar toggle into Feed.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Shared partners + eligible locations module",
    "REQ-SIMPLIFY-002. Extract src/lib/proposals/partners.ts; replace duplicates in schedule, slices, _core, fast-sleeping-core.",
  ],
  [
    "canViewProposalContent + strip dead mask trees",
    "REQ-SIMPLIFY-003. Helper returns { visible, contentMasked }; use on schedule/slices; delete hardcoded masked=false dead privacy trees in board/feed/_core.",
  ],
  [
    "Unify Busy masked copy + rename calendar toggle label",
    "REQ-SIMPLIFY-004. One MASKED_TITLE Busy constant; kill HIDDEN_SLEEPING_TITLE/Private drift; admin label: Mask sleeping details for uninvolved admins on calendar.",
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
