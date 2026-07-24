/**
 * Creates Epic + story for public privacy policy page and in-app links.
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
  summary: "Public privacy policy for OAuth and user trust",
  issuetype: { name: "Epic" },
  description: doc(
    "Publish an accurate privacy policy URL reflecting PolyCal data storage, Google Calendar OAuth, email/push, and in-group sharing; link from profile settings and guided setup.",
  ),
});
console.log("Epic", epic);

const story = await createIssue({
  project: { key: "PC" },
  summary: "Privacy policy page + links on profile and onboarding",
  issuetype: { name: "Story" },
  parent: { key: epic },
  labels: ["REQ-PRIVACY-001"],
  description: doc(
    "REQ-PRIVACY-001: Add public /privacy page derived from schema/integrations (auth, profile, proposals, Google Calendar encrypted tokens, Resend, web push, Turso). Allowlist in middleware. Link at bottom of Profile & Settings and at front of FirstLoginWizard. Suitable for Google OAuth consent privacy policy URL.",
  ),
});
console.log("Story", story);
