/**
 * Creates Epic + stories for poll invitee and self-appointment day-boundary E2E journeys.
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
  summary: "E2E: poll invitee paths + midnight/11pm self-appointment day boundaries",
  issuetype: { name: "Epic" },
  description: doc(
    "Playwright journeys for multi-invitee poll approve/decline and self-appointments at 12am/11pm (1h and 2d, with weekly recurrence).",
  ),
});
console.log("Epic", epic);

const stories = [
  {
    summary:
      "E2E journey: poll with required/optional approve via inbox vs proposal and decline note",
    description:
      "REQ-E2E-POLL-INV-001: Create poll with 3 slots for 2 required + 1 optional. One required approves via notification open path; other via Proposed. Optional declines with note; proposer sees decline + message.",
    labels: ["REQ-E2E-POLL-INV-001"],
  },
  {
    summary:
      "E2E journey: self-appointment day boundaries at 12am/11pm (1h and 2d, recurring)",
    description:
      "REQ-E2E-APPT-DAY-001: Solo self-appointments three days out at 12am and 11pm for 1-hour and 2-day durations, with and without weekly recurrence (3 weeks). Confirm events land on the expected calendar days.",
    labels: ["REQ-E2E-APPT-DAY-001"],
  },
];

for (const story of stories) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: story.summary,
    issuetype: { name: "Story" },
    description: doc(story.description),
    labels: story.labels,
    parent: { key: epic },
  });
  console.log(key, story.summary);
}
