/**
 * Creates PC epic + tasks for Schedule UX refactor (Phases A–D).
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
const email = env.JIRA_EMAIL;
const token = env.JIRA_API_TOKEN;

if (!baseUrl || !email || !token) {
  console.error("Missing JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN");
  process.exit(1);
}

const auth = Buffer.from(`${email}:${token}`).toString("base64");

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
    summary: "Schedule tab UX/UI refactor",
    issuetype: { name: "Epic" },
    description: doc(
      "Improve Schedule usability and Garden Brutalism aesthetic: chrome, day sheet, create-from-calendar, mobile agenda, URL/a11y.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Phase A: Schedule chrome, Today, Garden visual unify",
    "Unify Week|2 weeks|Month control; View options sheet for filters/legend; Today + persist anchor; Garden heatmap/month cells; Masked in legend; aria-busy loading.",
  ],
  [
    "Phase B: Month day sheet + create-from-calendar",
    "Day tap/+N opens day sheet; create event/sleeping with prefilled date; fix empty month icons; compact overflow +N.",
  ],
  [
    "Phase C: Mobile agenda week + flatter open path",
    "Under sm render agenda by day; open detail directly when unambiguous; demote chooser/detach nesting.",
  ],
  [
    "Phase D: URL state, a11y, empty states, journeys",
    "Encode layout/anchor/open in URL; month a11y names; Planning aria-pressed; EmptyState consistency; update schedule journeys.",
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
  console.log(issue.key, summary);
}
