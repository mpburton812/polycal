/**
 * Creates Epic + story for branded email verification landing (plan).
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
  summary: "Branded email verification landing page",
  issuetype: { name: "Epic" },
  description: doc(
    "Replace JSON /api/verify-email response with Garden /verify-email landing and continue-to-app CTA.",
  ),
});
console.log("Epic", epic);

const story = await createIssue({
  project: { key: "PC" },
  summary: "Public /verify-email landing; API redirects; mail links updated",
  issuetype: { name: "Story" },
  parent: { key: epic },
  labels: ["REQ-EMAIL-VERIFY-UX-001"],
  description: doc(
    "REQ-EMAIL-VERIFY-UX-001: Shared verify helper; branded success/error page with Continue to PolyCal; point profile/credentials links at /verify-email; /api/verify-email 302s for old emails; middleware allowlist.",
  ),
});
console.log(story);
