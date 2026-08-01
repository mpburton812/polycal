/**
 * Creates PC epic + tasks for E2E suite speedups (shared CI build, storageState, SAFE_PARALLEL).
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
    summary: "E2E suite speedup: shared build, auth storageState, SAFE_PARALLEL workers",
    issuetype: { name: "Epic" },
    description: doc(
      "Cut Playwright wall clock: one CI Next build shared across shards; reuse JWT storageState; parallel workers for SAFE_PARALLEL specs with per-worker DBs.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "CI: share one Next build artifact across Playwright shards",
    "Build once, upload .next artifact; shard jobs download and run next start only (e2e.yml + production.yml).",
  ],
  [
    "Playwright auth storageState for seed users",
    "Setup project logs in luke/leia/han once; specs reuse HttpOnly JWT cookies; login() remains for switches and unauthenticated cases.",
  ],
  [
    "Parallel workers for SAFE_PARALLEL specs with per-worker DBs",
    "SAFE_PARALLEL project workers>1 against isolated e2e-w{N}.db + ports; SERIAL_ONLY stays workers:1 on primary DB.",
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
