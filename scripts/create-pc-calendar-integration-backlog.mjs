/**
 * Creates PC Epic + tasks for external calendar integration (Option B).
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

async function jira(apiPath, body) {
  const res = await fetch(`${baseUrl}/rest/api/3/${apiPath}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return JSON.parse(text);
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
    summary: "External calendar integration (Google + iCal/ICS)",
    issuetype: { name: "Epic" },
    labels: ["REQ-CAL-INT"],
    description: doc(
      "Option B: Google Calendar OAuth sync into an existing personal calendar; iCal/Other via Download/Email/Both. One-way PolyCal→external on resolve/reschedule/cancel. Sleeping = all-day free/transparent with PolyCal sleeping title. At-risk keeps external events. All configured invitees. Both keeps pending download after email.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Calendar schema + token encryption + sync service core",
    "REQ-CAL-INT-001. SCHEMA calendar_connections, calendar_event_links, calendar_ics_pending; encrypt Google refresh tokens; calendarSync orchestrator hooks.",
  ],
  [
    "Google OAuth connect + Calendar API adapter",
    "REQ-CAL-INT-002. /api/calendar/google/start+callback; list calendars; insert/patch/delete; sleeping transparency; env GOOGLE_* + CALENDAR_TOKEN_ENCRYPTION_KEY.",
  ],
  [
    "ICS builder + email attachments + pending download queue",
    "REQ-CAL-INT-003. ics.ts; Resend attachments; Download/Email/Both prefs; notification + pending download on login when email unavailable.",
  ],
  [
    "Profile + onboarding calendar integration UI",
    "REQ-CAL-INT-004. Provider choice Google vs iCal/Other; calendar picker; delivery prefs; disconnect; pending download prompt.",
  ],
  [
    "Lifecycle hooks + unit/e2e coverage for calendar sync",
    "REQ-CAL-INT-005. Hook resolve/reschedule/cancel for all configured invitees; unit tests for ICS/payloads; e2e prefs where feasible.",
  ],
];

for (const [summary, description] of tasks) {
  const issue = await jira("issue", {
    fields: {
      project: { key: "PC" },
      summary,
      issuetype: { name: "Task" },
      parent: { key: epic.key },
      description: doc(description),
    },
  });
  console.log("TASK", issue.key, summary);
}
