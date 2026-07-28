/**
 * Creates PC epic + stories for FastSleep proposal type (rule B, admin toggle, auto-resolve).
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
  summary: "FastSleep proposal type — partner arrangements, auto-accept, admin toggle",
  issuetype: { name: "Epic" },
  labels: ["REQ-FASTSLEEP"],
  description: doc(
    "New proposalType fast_sleep: any user in a sleeping arrangement can schedule up to 14 nights for self and partner arrangements (rule B), auto-accepted, one feed Auto-confirmed card, notifications, feed/calendar/ICS, admin toggle default ON.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Schema: fast_sleep proposal type + fastSleepEnabled network toggle (default ON)",
    "REQ-FASTSLEEP-SCHEMA",
    "Add proposalType fast_sleep; networks/poly_group fastSleepEnabled default true; admin Switch; migrations.",
  ],
  [
    "FastSleep authority rule B + create/auto-resolve action + notifications",
    "REQ-FASTSLEEP-CORE",
    "Per-night subjectUserId; scheduler may schedule self + partner arrangements (P solo, P-Q, Q solo); reject A-C; auto-resolve; notify all involved.",
  ],
  [
    "FastSleep UI grid + calendar/feed/schedule wiring",
    "REQ-FASTSLEEP-UI",
    "FastSleep entry gated on toggle; per-night subject grid; userOnBatchNight includes subject; feed one auto_resolved milestone; ICS/Google per night.",
  ],
  [
    "FastSleep unit + user journey tests (TZ, feed, ICS, toggle, A-C)",
    "REQ-FASTSLEEP-TEST",
    "Unit authority/TZ/calendar; e2e journey: mixed nights, one feed card, schedule TZ, notifications, ICS, toggle off, A-C reject.",
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
