/**
 * Creates PC epic + stories for proposal UX, Poll, Schedule posting, and proxy.
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
  summary: "[Epic] Proposal UX, Poll gate, Schedule posting, and proxy",
  issuetype: { name: "Epic" },
  labels: ["REQ-PROP-UX"],
  description: doc(
    "Shared create FAB on all screens; Feedback in profile menu; network-scoped place pickers; no default draft highlights; strip composer chips; admin Poll on/off; Just Proposals vs Proposals and Schedule; Proxy Scheduling.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Sage + FAB with all proposal types on every authenticated screen",
    "REQ-PROP-UX-001",
    "Mount shared ProposalCreateHost in AppShell. Event, Sleeping, FastSleep (if enabled), Sleeping partner, Residency on Feed/Schedule/Proposals/People & Places/Admin/Profile. Keep Schedule day-sheet date prefills.",
  ],
  [
    "Move Feedback from terracotta FAB into profile menu",
    "REQ-PROP-UX-002",
    "Add Feedback between Admin and Logout in AppHeader. Remove bottom-left Give feedback FAB. Screenshot + Send feedback dialog unchanged.",
  ],
  [
    "Scope proposal location pickers to the active network",
    "REQ-PROP-UX-003",
    "Admin and residency pickers must not list other-network or orphan places. Drop places with no accepted residents who are active members. Keep places the current user just created.",
  ],
  [
    "No pre-selected Window or With invitees; fly out after choice",
    "REQ-PROP-UX-004",
    "New drafts start with no sage highlight. When fields and invitee lists appear only after a button is selected. Edit restores saved values.",
  ],
  [
    "Remove Event Proposal, Draft, and By user from composer header",
    "REQ-PROP-UX-005",
    "Strip type chip, DRAFT chip, and by {name} from ProposalDraftDialog. Keep New proposal / Edit draft heading. Leave board card chrome unchanged.",
  ],
  [
    "Network admin Enable Poll; hide Poll on new drafts when off",
    "REQ-PROP-UX-006",
    "poll_enabled default ON. When off, omit Poll from Schedule type on new drafts and reject isPoll on create. Grandfather existing poll drafts. Hide Poll when posting mode is Schedule.",
  ],
  [
    "Just Proposals vs Proposals and Schedule posting mode",
    "REQ-PROP-UX-007",
    "Admin exclusive choice, default Just Proposals. Dual mode shows Proposal vs Schedule above Schedule Type. Schedule skips votes, has no Required/Optional, Add to calendar auto-resolves, does not appear in Proposed.",
  ],
  [
    "Proxy Scheduling on-behalf-of pulldown",
    "REQ-PROP-UX-008",
    "Admin Proxy Scheduling (default off) plus anyone vs sleeping partners. Pulldown only when Proposals and Schedule is on, proxy is on, and Schedule is selected. Server validates scope.",
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
