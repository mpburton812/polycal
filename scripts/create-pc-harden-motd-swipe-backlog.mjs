/**
 * Creates PC Epic + stories for harden journeys, MOTD Admin toggle,
 * calendar archive policy, and keep-alive tab swipe carousel.
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

async function jira(apiPath, body, method = "POST") {
  const res = await fetch(`${baseUrl}/rest/api/3/${apiPath}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
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
    summary: "Harden journeys, MOTD Admin toggle, calendar archive, keep-alive swipe",
    issuetype: { name: "Epic" },
    labels: ["REQ-HARDEN-SWIPE-001"],
    description: doc(
      "Harden flaky poll/residency journeys; Admin MOTD with All Platform toggle for platform admins; stop Google/ICS delete on auto-archive; cancel/hard-delete keep Google delete + ICS manual-delete notice; keep-alive main-tab DOM carousel + swipe journey suite; promote to production.",
    ),
  },
});
console.log("EPIC", epic.key);

const stories = [
  [
    "Harden poll-optional-decline and residency-proposal E2E",
    "Wait for proposal detail ready + vote toasts; re-expand place after bedroom Save; dismiss blocking dialogs.",
  ],
  [
    "Calendar: keep Google on auto-archive; manual ICS notice on cancel",
    "Remove scheduleCalendarSync delete from archivePastResolvedProposals; cancel/hard-delete still delete Google; ICS users get clear manual-delete notification.",
  ],
  [
    "Admin MOTD: network node + All Platform toggle for platform admins",
    "Unify MotdAdminForm on /admin; network admins publish to node; platform admins can toggle All Platform (server-enforced).",
  ],
  [
    "Keep-alive MainTabCarousel for Feed/Schedule/Proposals/People",
    "Lazy-mount then keep panels in DOM; swipe + AppTabs change active index with slide; URL sync; profile/admin stay normal routes.",
  ],
  [
    "Tab swipe keepalive user journey suite",
    "e2e journey covering strip traversal, scroll/sub-tab preserve, modal blocks swipe, feedEnabled, deep links, partial gestures.",
  ],
];

for (const [summary, description] of stories) {
  const issue = await jira("issue", {
    fields: {
      project: { key: "PC" },
      summary,
      issuetype: { name: "Story" },
      parent: { key: epic.key },
      description: doc(description),
    },
  });
  console.log("STORY", issue.key, summary);
}
