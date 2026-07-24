/**
 * Creates Story tickets for onboarding Google return + inbox Open/prune fixes.
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
  throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN");
}

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function create(fields) {
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
  return JSON.parse(text);
}

const a = await create({
  project: { key: "PC" },
  summary: "Restore onboarding Calendar step after Google OAuth connect",
  issuetype: { name: "Bug" },
  labels: ["REQ-ONBOARD-GCAL"],
  description: doc(
    "During first-login wizard Calendar step, Google OAuth redirects to /profile and remounts FirstLoginWizard with activeStep reset (Avatar/Sleeping partners). Persist onboarding return in OAuth state and restore step 4 via query/sessionStorage.",
  ),
});

const b = await create({
  project: { key: "PC" },
  summary: "Inbox Open Proposal for partnerships + prune stale on bell open",
  issuetype: { name: "Story" },
  labels: ["REQ-INBOX-OPEN-PRUNE"],
  description: doc(
    "Add Open Proposal on partnership_proposed inbox rows (deep-link people-places). Rename Open Notification to Open Proposal. On bell open reconcile/dismiss actionable notifications that are no longer actionable; dismiss partnership_proposed when accepting outside the inbox.",
  ),
});

console.log("BUG", a.key);
console.log("STORY", b.key);
