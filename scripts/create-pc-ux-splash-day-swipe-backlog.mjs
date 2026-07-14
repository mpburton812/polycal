/**
 * Creates Epic + stories for UX splash, swipe tabs, Day view, legend cleanup.
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
  summary: "UX: branded splash, tab swipe, Day view, legend cleanup",
  issuetype: { name: "Epic" },
  description: doc(
    "Fast branded loading + PWA update cue; swipe main tabs; Day 12a-12a schedule view; remove View options legend.",
  ),
});
console.log("Epic", epic);

const tasks = [
  {
    summary: "Branded loading splash + stream app shell + PWA update cue",
    description:
      "REQ-UX-SPLASH-001: Garden splash for route loads; stream layout; show Updating PolyCal when SW activates after deploy.",
    labels: ["REQ-UX-SPLASH-001"],
  },
  {
    summary: "Swipe left/right between main app tabs",
    description:
      "REQ-UX-SWIPE-001: Horizontal swipe on main content navigates adjacent bottom tabs; respect admin; ignore horizontal scrollers.",
    labels: ["REQ-UX-SWIPE-001"],
  },
  {
    summary: "Schedule Day period with 12a-12a hour grid",
    description:
      "REQ-CAL-DAY-001: Add Day to period chrome; all-day strip; timed events on 24h column; URL/localStorage persistence.",
    labels: ["REQ-CAL-DAY-001"],
  },
  {
    summary: "Remove schedule View options legend",
    description: "REQ-CAL-LEGEND-001: Remove status legend from View options drawer only.",
    labels: ["REQ-CAL-LEGEND-001"],
  },
];

for (const task of tasks) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: task.summary,
    issuetype: { name: "Story" },
    parent: { key: epic },
    labels: task.labels,
    description: doc(task.description),
  });
  console.log(key, task.summary);
}
