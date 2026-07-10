/**
 * One-shot: create epic + child tickets for alpha feedback system.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvLocal();

const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
const email = process.env.JIRA_EMAIL;
const token = process.env.JIRA_API_TOKEN;

if (!baseUrl || !email || !token) {
  console.error("Missing JIRA_* in .env.local");
  process.exit(1);
}

const auth = Buffer.from(`${email}:${token}`).toString("base64");

async function jira(path, body) {
  const response = await fetch(`${baseUrl}/rest/api/3${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

function adfParagraph(text) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

async function createIssue(fields) {
  const result = await jira("/issue", { fields });
  return result.key;
}

async function main() {
  const epicKey = await createIssue({
    project: { key: "PC" },
    summary: "Alpha tester feedback system",
    issuetype: { name: "Epic" },
    description: adfParagraph(
      "In-app floating feedback (screenshot + bug/feature form) writing to Turso, plus Tauri Windows tracker for triage, status, comments, and in-app reply notifications.",
    ),
  });
  console.log("Epic:", epicKey);

  const tickets = [
    {
      summary: "alpha_feedback_submissions schema v19 migration",
      description: "Add Turso table for alpha feedback with screenshot blob and status fields.",
    },
    {
      summary: "In-app FeedbackFab, dialog, console capture, submit action",
      description: "Floating button, screenshot, silent diagnostics, submitAlphaFeedbackAction.",
    },
    {
      summary: "Admin alpha-feedback list/detail/patch/notify API",
      description: "Admin-gated REST endpoints for the Tauri tracker.",
    },
    {
      summary: "Tauri Windows alpha feedback tracker app",
      description: "Sortable grid, status dropdown, comments, notify submitter, screenshot preview.",
    },
  ];

  for (const ticket of tickets) {
    const key = await createIssue({
      project: { key: "PC" },
      summary: ticket.summary,
      issuetype: { name: "Story" },
      parent: { key: epicKey },
      description: adfParagraph(ticket.description),
      labels: ["REQ-ALPHA-FB"],
    });
    console.log(key, ticket.summary);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
