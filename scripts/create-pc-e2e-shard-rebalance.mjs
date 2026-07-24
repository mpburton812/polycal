/**
 * Creates PC task for suite-scoped Playwright CI shard rebalance.
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

const key = await createIssue({
  project: { key: "PC" },
  summary: "Rebalance Playwright CI shards: serial vs safe suite-scoped matrix",
  issuetype: { name: "Task" },
  labels: ["REQ-E2E-SHARD-REBAL-001"],
  description: doc(
    "REQ-E2E-SHARD-REBAL-001: Replace flat --shard=N/5 with suite-scoped matrix (serial x3 + safe x2) so SERIAL_ONLY and SAFE_PARALLEL are sharded independently. Lean server topology per suite (E2E_INCLUDE_MOBILE / E2E_PARALLEL_WORKERS). Update e2e.yml, production.yml, and timing docs. Acceptance: --list shows serial spread across 3 shards; CI wall clock drops vs ~22m serial-packed baseline.",
  ),
});
console.log(key);
