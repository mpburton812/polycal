/**
 * Creates PC task: production release notes for July 21 wave.
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

function doc(text) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

const issue = await fetch(`${baseUrl}/rest/api/3/issue`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    fields: {
      project: { key: "PC" },
      summary: "Production release notes: UX batch + Feed Controls + icon sizes",
      issuetype: { name: "Task" },
      labels: ["REQ-PROD-RELEASE"],
      description: doc(
        "Add a single consolidated Code Status / CHANGELOG production release entry rolling up six-item UX (PC-258–263), Feed Controls (PC-264–269), icon size normalize (PC-270), and audit brace-expansion fix. Promote test → production with mandatory user journeys.",
      ),
    },
  }),
});
const text = await issue.text();
if (!issue.ok) throw new Error(`${issue.status} ${text}`);
console.log(JSON.parse(text).key);
