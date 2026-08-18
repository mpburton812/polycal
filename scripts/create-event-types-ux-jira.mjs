/**
 * Creates PC epic + stories for composer UX, proposed actions, FAB, Just Bookings.
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
  summary: "[Epic] Composer UX, proposed actions, FAB placement, and Just Bookings",
  issuetype: { name: "Epic" },
  labels: ["REQ-EVENT-TYPES-UX"],
  description: doc(
    "Keep New Event selections green, rename Proposal or Booking, remove Batch nights from New Event, Cancel Event plus Back to Draft on proposed details, hide FAB on Feed and People and Places, add Admin Event Types Just Bookings. Promote feature to dev, test, then production.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "New Event keep selections green, Proposal or Booking copy, drop Batch nights",
    "REQ-EVENT-TYPES-UX-001",
    "Selected Social/Sleeping and Proposal/Booking stay sage-green. Label is Proposal or Booking with caption that proposals are voted and bookings are auto-accepted. Remove Batch nights from new sleeping drafts; Bulk Sleep Booking remains.",
  ],
  [
    "Proposed detail Cancel Event, Back to Draft, drop Delete and Reschedule",
    "REQ-EVENT-TYPES-UX-002",
    "Proposed detail always shows Cancel Event. Remove Delete proposal and Reschedule. Add Back to Draft for proposer or admin which reverts proposed to draft and opens the composer.",
  ],
  [
    "Hide sage create FAB on Feed and People and Places",
    "REQ-EVENT-TYPES-UX-003",
    "Keep the create host mounted. Hide the plus FAB on /feed and /people-places. Keep FAB on Schedule, Proposals, Admin, and Profile.",
  ],
  [
    "Admin Event Types Just Bookings disables scheduling proposals and polls",
    "REQ-EVENT-TYPES-UX-004",
    "Rename Proposal posting to Event Types. Add Just Bookings which forces booking on New Event Social and Sleeping nights, disables Poll, and leaves sleeping-partner and residency proposals intact.",
  ],
];

const keys = [epic];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    parent: { key: epic },
    summary,
    issuetype: { name: "Story" },
    labels: ["REQ-EVENT-TYPES-UX", label],
    description: doc(description),
  });
  console.log("STORY", key, summary);
  keys.push(key);
}

await transitionInProgress(keys[1]);
console.log("KEYS", keys.join(" "));
