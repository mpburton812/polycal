/**
 * Creates PC epic + stories for Admin UX / onboarding / residency-cut batch.
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
  summary:
    "[Epic] Admin UX batch — user list, alerts, onboarding, New Event NLP, residency cut, Goto Today",
  issuetype: { name: "Epic" },
  labels: ["REQ-ADMIN-UX-BATCH"],
  description: doc(
    "Network-scope admin users after remove; platform alert By/When/target; Add person selector; FirstLogin Email+Password + step nav; hide proposal enforcement; remove Admin fast sleep panel; NLP New Event primary; remove residency proposals; Goto Today bounce; efficiency+security; promote through production + APK.",
  ),
});
console.log("epic", epic);
await transitionInProgress(epic);

const stories = [
  {
    summary: "Network-scope Admin User management after remove",
    labels: ["REQ-ADMIN-001"],
    description:
      "listAdminUsersAction must only return active network members so removed users leave Admin → User management.",
  },
  {
    summary: "Platform alerts show By Who, When, and target user",
    labels: ["REQ-ALERT-001"],
    description:
      "Extend platform_system_log + PlatformLogAlertHost with actor, timestamp, optional target for removals and all alerts.",
  },
  {
    summary: "Add person: User/Proxy selector then form segments",
    labels: ["REQ-UX-001"],
    description:
      "Replace Active/Proxy tabs with progressive selector like New Event composer.",
  },
  {
    summary: "User Setup: clickable steps + Email and Password",
    labels: ["REQ-ONB-001"],
    description:
      "Back + nonLinear stepper; move email to Email and Password with privacy note/links.",
  },
  {
    summary: "Hide Proposal enforcement when proposals inactive",
    labels: ["REQ-ADMIN-002"],
    description: "Hide when schedulingPosting is bookings_only.",
  },
  {
    summary: "Remove Admin Fast sleeping plan panel",
    labels: ["REQ-ADMIN-003"],
    description: "Remove AdminFastSleepingPlanPanel only; keep Enable toggle + member FAB.",
  },
  {
    summary: "New Event = NLP (top); Legacy New Event = manual",
    labels: ["REQ-COMP-001"],
    description: "Reorder FAB menu and dialog titles; update shortcuts.",
  },
  {
    summary: "Remove residency proposals; keep Places Owner/Resident",
    labels: ["REQ-PLACE-001"],
    description:
      "Delete FAB/dialog/special type; migrate open proposed rows; People & Places remains assignment path.",
  },
  {
    summary: "Fix Goto Today calendar bounce",
    labels: ["REQ-CAL-001"],
    description:
      "Stabilize weekStart; gate Agenda pin; suppress prepend; instant scroll after goToday.",
  },
  {
    summary: "Efficiency + security review for Admin UX batch",
    labels: ["REQ-QUAL-001"],
    description: "Join-scoped queries, platform-log fields, authz, place membership boundary.",
  },
];

const keys = [];
for (const story of stories) {
  const key = await create({
    project: { key: "PC" },
    summary: story.summary,
    issuetype: { name: "Story" },
    labels: story.labels,
    description: doc(story.description),
    parent: { key: epic },
  });
  console.log("story", key, story.summary);
  keys.push(key);
  await transitionInProgress(key);
}

console.log(JSON.stringify({ epic, stories: keys }, null, 2));
