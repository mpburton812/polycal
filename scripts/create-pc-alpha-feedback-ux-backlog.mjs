/**
 * Creates PC tasks for Alpha Feedback tracker comment log + screenshot lightbox.
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
    summary: "Alpha Feedback tracker: lightbox, comment log, notify on save",
    issuetype: { name: "Epic" },
    description: doc(
      "Full-size screenshot view; dated comment log on Save; notify submitter when submitter comment saved; remove Notify button.",
    ),
  },
});
console.log("EPIC", epic.key);

for (const [summary, description] of [
  [
    "Alpha Feedback: full-size screenshot lightbox",
    "Click the ticket screenshot thumbnail to open a full-size dialog.",
  ],
  [
    "Alpha Feedback: dated comment log on Save",
    "Append timestamped internal/submitter comments to a log; clear draft fields after Save.",
  ],
  [
    "Alpha Feedback: notify submitter on Save when submitter comment present",
    "Remove Notify Submitter button; call notify when Save includes a non-empty submitter comment.",
  ],
]) {
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
