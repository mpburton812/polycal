/**
 * Creates PC epic + stories for platform admin elevation / access level UI.
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

async function create(fields) {
  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return JSON.parse(text).key;
}

async function transitionInProgress(key) {
  const transitions = await fetch(`${baseUrl}/rest/api/3/issue/${key}/transitions`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const body = await transitions.json();
  const target = (body.transitions || []).find(
    (t) => /progress/i.test(t.name) || t.to?.statusCategory?.key === "indeterminate",
  );
  if (!target) return;
  await fetch(`${baseUrl}/rest/api/3/issue/${key}/transitions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ transition: { id: target.id } }),
  });
}

if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
  throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN");
}

const epic = await create({
  project: { key: "PC" },
  summary: "Platform admins can elevate users and manage access levels",
  issuetype: { name: "Epic" },
  labels: ["REQ-PLATFORM-ADMIN-ELEVATE"],
  description: doc(
    "Platform admins (e.g. mpburton) can grant/revoke Platform Admin from Admin user management and Platform Admin All Users. Show access level and avatar on All Users.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Elevate/revoke Platform Admin from Admin user management",
    "REQ-ADMIN-ELEVATE-PLATFORM",
    "Platform admins can elevate a user to Platform Admin (and revoke) in the User management section of the Admin screen.",
  ],
  [
    "All Users shows access level, avatar, and change-access action",
    "REQ-PLATFORM-ALL-USERS-ACCESS",
    "Platform Admin All Users lists access level and avatar per user; each user block offers access level changes (Platform Admin / Admin / User).",
  ],
];

const keys = [];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    summary,
    issuetype: { name: "Story" },
    labels: [label],
    parent: { key: epic },
    description: doc(description),
  });
  keys.push(key);
  console.log("STORY", key, summary);
}

await transitionInProgress(epic);
for (const key of keys) await transitionInProgress(key);

console.log("ALL", [epic, ...keys].join(","));
