/**
 * Creates Epic + tasks for place owner / residency approval (plan).
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
  summary: "Place owners, residency add, and owner approval for self-join",
  issuetype: { name: "Epic" },
  description: doc(
    "Owner/Resident roles on places; owners add immediately; self-join proposals approved by owners; residency picker shows members.",
  ),
});
console.log("Epic", epic);

const tasks = [
  {
    summary: "Add place_role on location_residents + migration/backfill",
    description:
      "Schema column owner|resident; creators backfilled as owner; others resident.",
  },
  {
    summary: "Owner/admin immediate add person with Owner or Resident role",
    description:
      "Places tab action adds membership as accepted immediately and notifies the target.",
  },
  {
    summary: "Self-join residency proposals invite place owners for approval",
    description:
      "Non-owners may propose themselves; owners are required invitees; resolve as resident.",
  },
  {
    summary: "Places UI Owner/Resident chips and owner Add person controls",
    description: "Show roles; owners (and admins) get Add person + role picker.",
  },
  {
    summary: "Residency place picker shows current owners and residents",
    description: "Enrich place options and display member names in ResidencyCreateDialog.",
  },
  {
    summary: "Seeds and e2e for place owner residency flows",
    description: "Update seeds and residency/people-places journeys for new rules.",
  },
];

for (const task of tasks) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: task.summary,
    issuetype: { name: "Task" },
    parent: { key: epic },
    description: doc(task.description),
  });
  console.log(key, task.summary);
}
