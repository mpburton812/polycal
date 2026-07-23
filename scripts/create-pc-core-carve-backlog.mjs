/**
 * Creates PC Epic + tasks for _core carve (simplify Epic 4).
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
    summary: "Carve proposals _core.ts into service modules (simplify Epic 4)",
    issuetype: { name: "Epic" },
    labels: ["REQ-SIMPLIFY-030"],
    description: doc(
      "Move conflicts, resolution, voting, comments, and lifecycle out of _core.ts into lib/proposals/services (or actions facades). Leave draft CRUD + detail orchestration in _core. Behavior-preserving; keep public proposals.ts re-exports stable.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Extract conflicts + resolution services from _core",
    "REQ-SIMPLIFY-031. Move proposalConflictWindows/gather/autoDecline/place conflicts and resolveProposal/evaluateAfterVote/poll helpers into services; thin action wrappers remain.",
  ],
  [
    "Extract comments + lifecycle (+ optional voting) from _core",
    "REQ-SIMPLIFY-032. Move comment actions and cancel/redraft/reschedule/attendees/nudge; optionally cast vote actions. Avoid circular imports with getProposalDetailAction.",
  ],
  [
    "Re-exports + changelog + unit tests for _core carve",
    "REQ-SIMPLIFY-033. Keep proposals.ts and facade re-exports working; change control entry; npm run test:unit green.",
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
