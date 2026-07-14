/**
 * Creates Epic + stories for All Day date-range typing fix and dates/times journeys.
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
  summary: "Fix All Day End day typing + comprehensive dates/times journeys",
  issuetype: { name: "Epic" },
  description: doc(
    "Stop Incomplete ISO End day keystrokes from swapping into Day; add dates/times journey coverage; expand Playwright CI to 5 shards.",
  ),
});
console.log("Epic", epic);

const tasks = [
  {
    summary: "Fix All Day/sleeping date range: do not reorder until both ISO dates valid",
    description:
      "REQ-DATE-RANGE-001: ProposalDateRangeField must not lexicographically swap Day/End day while End day is partial (typing 1 or 2).",
    labels: ["REQ-DATE-RANGE-001"],
    type: "Bug",
  },
  {
    summary: "User journey: Window/All Day/Poll/Recurring dates and times valid+invalid",
    description:
      "REQ-DATE-JOURNEY-001: Playwright journey covering When modes with valid fills and invalid cases (partial ISO, letters, negatives, end before start, duplicate poll slots).",
    labels: ["REQ-DATE-JOURNEY-001"],
    type: "Story",
  },
  {
    summary: "Expand Playwright CI matrix to 5 shards",
    description: "REQ-E2E-SHARD-005: e2e.yml and production.yml use --shard=N/5.",
    labels: ["REQ-E2E-SHARD-005"],
    type: "Task",
  },
];

for (const task of tasks) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: task.summary,
    issuetype: { name: task.type },
    parent: { key: epic },
    labels: task.labels,
    description: doc(task.description),
  });
  console.log(key, task.summary);
}
