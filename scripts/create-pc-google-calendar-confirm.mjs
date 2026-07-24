/**
 * Creates Story + Bug under PC-337 for Google Calendar confirmation notifications
 * and admin Fast sleeping sync reliability.
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

const story = await create({
  project: { key: "PC" },
  parent: { key: "PC-337" },
  summary: "Notify when Google Calendar sync succeeds or fails",
  issuetype: { name: "Story" },
  labels: ["REQ-CAL-GOOGLE-CONFIRM"],
  description: doc(
    "In-app notification (inbox/push/email per prefs) when Google Calendar insert/patch/delete succeeds or when sync skips/fails (no calendar selected, needs reconnect, API error). Mirror ICS calendar_ics_pending pattern. Only notify the user whose connection was synced.",
  ),
});

const bug = await create({
  project: { key: "PC" },
  parent: { key: "PC-337" },
  summary: "Admin Fast sleeping resolve may miss Google Calendar push",
  issuetype: { name: "Bug" },
  labels: ["REQ-CAL-FAST-SYNC"],
  description: doc(
    "Admin Fast sleeping plan add resolved in PolyCal but no Google event for connected proposer when invitee has no Google. Await sync on admin force-resolve; notify on silent skips; auto-select primary calendar if unset after OAuth; cover one-sided vs both Google in tests.",
  ),
});

console.log("STORY", story.key);
console.log("BUG", bug.key);
