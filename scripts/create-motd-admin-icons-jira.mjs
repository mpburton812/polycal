/**
 * Creates Epic + stories for MOTD, Admin nav cleanup, and event icons.
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

async function createIssue(fields) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text).key;
}

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const epic = await createIssue({
  project: { key: "PC" },
  summary: "[Epic] MOTD, Admin nav cleanup, and event icons",
  issuetype: { name: "Epic" },
  description: doc(
    "Platform/network Message of the Day pop-ups; move Admin under header cog and remove duplicate Platform panel from Admin; upgrade event category icons to multi-color higher-detail SVGs.",
  ),
});
console.log("Epic", epic);

const stories = [
  {
    summary: "MOTD schema, actions, popup host, and admin UIs",
    label: "REQ-MOTD-001",
    description:
      "REQ-MOTD-001: motd_messages + motd_acknowledgments; publish/clear network (network admin) and platform (platform admin); one active per scope; optional endsAt; dismiss-once ack; MotdPopupHost poll/focus; admin forms on Network dashboard and Platform Admin.",
  },
  {
    summary: "Admin nav: remove bottom tab; cog under Platform admin; drop Admin Platform panel",
    label: "REQ-MOTD-002",
    description:
      "REQ-MOTD-002: Remove /admin from MAIN_TAB_HREFS; add Admin to AppHeader menu below Platform admin for userCanSeeAdminTab; remove AdminPlatformDashboardPanel from admin page.",
  },
  {
    summary: "Multi-color higher-detail event category icons",
    label: "REQ-MOTD-003",
    description:
      "REQ-MOTD-003: Redesign EventCategoryIcon with fixed multi-color fills and richer paths; preserve watermark placement and container opacity; stop month chip forcing status color onto SVG.",
  },
];

for (const s of stories) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: s.summary,
    issuetype: { name: "Story" },
    parent: { key: epic },
    labels: [s.label],
    description: doc(s.description),
  });
  console.log("Story", key, s.label);
}
