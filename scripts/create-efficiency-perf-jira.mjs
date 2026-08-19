/**
 * Creates PC epic + stories for efficiency phases (FAB, indexes, refresh, CI).
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
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
  console.error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN");
  process.exit(1);
}

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function create(fields) {
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return JSON.parse(text).key;
}

async function transitionInProgress(key) {
  const transitions = await fetch(`${baseUrl}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const body = await transitions.json();
  const target = (body.transitions || []).find(
    (t) => /progress/i.test(t.name) || t.to?.statusCategory?.key === "indeterminate",
  );
  if (!target) return;
  await fetch(`${baseUrl}/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ transition: { id: target.id } }),
  });
}

const epic = await create({
  project: { key: "PC" },
  summary: "[Epic] Composer and board performance: instant FAB, indexes, refresh policy, CI",
  issuetype: { name: "Epic" },
  labels: ["REQ-EFFICIENCY-PERF"],
  description: doc(
    "Phase 1 instant FAB plus bootstrap action. Phase 2 SCHEMA_VERSION 51 indexes and scoped queries. Phase 3 local mutation patch and single draft host. Phase 4 CI build artifact reuse. Promote each phase feature to dev then test, then production.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Instant FAB menu and single create bootstrap action",
    "REQ-EFFICIENCY-PERF-001",
    "Open the sage plus menu immediately. Fetch composer bootstrap in one server action. Mount dialogs only when open. Batch place member enrich. Scope people-rank SQL to the viewer.",
  ],
  [
    "SCHEMA_VERSION 51 network and feed indexes plus scoped list queries",
    "REQ-EFFICIENCY-PERF-002",
    "Add network_id composites on proposals, chat, comments, places, partnerships, ICS pending. Scope listPlaces residents and schedule slot prefilter to the active network.",
  ],
  [
    "Defer router.refresh on detail mutations and single draft-dialog host",
    "REQ-EFFICIENCY-PERF-003",
    "Patch local proposal detail after votes and comments. Refresh only when lists change. Route Schedule and Proposals edit through ProposalCreateHost.",
  ],
  [
    "Reuse E2E Next build artifact and cache Playwright browsers on production CI",
    "REQ-EFFICIENCY-PERF-004",
    "Avoid a second Next build on PRs to dev. Cache Playwright Chromium in production.yml the same way e2e.yml does.",
  ],
];

const keys = [epic];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    parent: { key: epic },
    summary,
    issuetype: { name: "Story" },
    labels: ["REQ-EFFICIENCY-PERF", label],
    description: doc(description),
  });
  console.log("STORY", key, summary);
  keys.push(key);
}

await transitionInProgress(keys[1]);
console.log("KEYS", keys.join(" "));
