/**
 * Creates PC epic + tasks for Email Scope C (Resend + polycal.net).
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
    summary: "Email delivery: Resend + polycal.net (Scope C)",
    issuetype: { name: "Epic" },
    description: doc(
      "Harden verify/notification email, email credentials on provision/reset, self-service forgot password. From: PolyCal <notifications@polycal.net>.",
    ),
  },
});
console.log("EPIC", epic.key);

const tasks = [
  [
    "Harden email verify links, templates, quiet hours",
    "Use getPublicAppUrl for verify links; hide verificationUrl when Resend succeeds; redact tokens in activity logs; apply quiet hours to email; shared HTML templates.",
  ],
  [
    "Email login credentials on create/activate/admin reset",
    "Optional email on create/activate; email instructions via Resend; clipboard always returned as fallback; audit without plaintext password.",
  ],
  [
    "Self-service forgot password via verified notification email",
    "Public forgot/reset pages; username request with anti-enumeration; token TTL ~1h; bump sessionVersion on reset.",
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
