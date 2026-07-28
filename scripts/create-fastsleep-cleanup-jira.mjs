/**
 * Creates PC epic + stories for FastSleep cleanup UX + Feed toggle.
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
  summary: "FastSleep cleanup UX + network Feed toggle",
  issuetype: { name: "Epic" },
  labels: ["REQ-FASTSLEEP-CLEANUP"],
  description: doc(
    "Multi-slot same night, Proposer label, per-slot notes, FastSleep Proposal / Residency Proposal renames, Feed enable toggle default ON.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "FastSleep multi-slot same night, Proposer label, per-slot notes",
    "REQ-FASTSLEEP-MULTISLOT",
    "Add another for this night; Subject→Proposer; note field; max 28 batch entries.",
  ],
  [
    "Rename FastSleep/Residency strings; retitle FastSleep admin toggle",
    "REQ-FASTSLEEP-RENAME",
    "FastSleep Proposal; Residency Proposal; Enable FastSleep Proposal.",
  ],
  [
    "Network feedEnabled toggle default ON — nav, route, actions",
    "REQ-FEED-TOGGLE",
    "Admin Enable Feed; hide /feed when off; redirect and reject feed actions.",
  ],
];

const keys = [];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    summary,
    issuetype: { name: "Story" },
    labels: [label],
    parent: { key: epic },
    description: doc(description),
  });
  keys.push(key);
  console.log("STORY", key, label);
}

await transitionInProgress(keys[0]);
console.log("PRIMARY", keys[0]);
console.log("ALL", [epic, ...keys].join(","));
