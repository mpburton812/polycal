/**
 * Creates PC epic + tasks for multi-server e2e harden + speed (PC-212 family).
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
    summary: "Harden multi-server e2e isolation and speed testing",
    issuetype: { name: "Epic" },
    description: doc(
      "Stop shared-w0 races (mobile own DB, workers=1 guard), reuse/cleanup gates, fixture parity, journey speed script, prepare parallelization, monitoring canvas; promote through production.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Mobile + workers=1 isolation for Playwright multi-server",
    "Dedicated mobile DB/port; serialize chromium-safe behind serial when workers<=1; auth setup for all indices.",
  ],
  [
    "E2E reuse gate, cleanup script, fixture parity, journey/npm speed",
    "E2E_REUSE_SERVER; e2e:cleanup; migrate raw journey imports; test:e2e:journeys; file-level reset; parallel prepare.",
  ],
  [
    "E2E flake monitoring canvas + promote through production",
    "Cursor canvas for topology/flake classes; PR chain feature→dev→test→production.",
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
