/**
 * Creates PC epic + stories for Schedule/Feed UX batch.
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
  summary: "Schedule / Feed UX batch — cancel vs archive, week today, filters, links, Post to Feed, VAPID",
  issuetype: { name: "Epic" },
  labels: ["REQ-SCHED-UX"],
  description: doc(
    "Cancelled events off PolyCal calendar; auto-archived stay on PolyCal+GCal; week opens on today; active filter indicator; linkify notes/comments; Post to Feed default OFF; permission audit; VAPID confirm; propose-reschedule journey; promote to production.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Distinguish cancelled vs auto-archived on schedule (keep GCal for archive)",
    "REQ-SCHED-CANCEL",
    "archiveKind cancelled vs auto; exclude cancelled from schedule; auto-archived visible; no GCal delete on auto-archive.",
  ],
  [
    "Week/two-week open on today; stop restoring stale weekStartIso",
    "REQ-SCHED-TODAY",
    "Persist layout/filters only; open period containing today; month full grid; URL anchor still wins.",
  ],
  [
    "Show active calendar network filter on chrome",
    "REQ-SCHED-FILTER",
    "Badge/active FilterList + chip when filterMode !== whole.",
  ],
  [
    "Linkify proposal description, notes, and comments",
    "REQ-SCHED-LINKS",
    "Reuse FeedLinkifiedBody in ProposalDetailDialog.",
  ],
  [
    "Post to Feed toggle default OFF on events",
    "REQ-SCHED-FEED",
    "post_to_feed column default false; draft checkbox; gate feed milestones.",
  ],
  [
    "Propose required event → invitee cannot reschedule journey + permission audit",
    "REQ-SCHED-JOURNEY",
    "E2E journey; never show inaccessible Reschedule/Re-draft; scan ecosystem for similar gaps.",
  ],
  [
    "Confirm VAPID push subscription + non-silent notification sound",
    "REQ-SCHED-VAPID",
    "Verify keys/subscribe; ensure showNotification not silent; vibrate when supported.",
  ],
];

const keys = { epic };
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    summary,
    issuetype: { name: "Story" },
    labels: [label, "REQ-SCHED-UX"],
    description: doc(description),
    parent: { key: epic },
  });
  console.log(key, summary);
  keys[label] = key;
  await transitionInProgress(key);
}
await transitionInProgress(epic);

fs.writeFileSync(
  path.join(process.cwd(), ".tmp-schedule-ux-jira-keys.json"),
  JSON.stringify(keys, null, 2) + "\n",
);
console.log(JSON.stringify(keys, null, 2));
