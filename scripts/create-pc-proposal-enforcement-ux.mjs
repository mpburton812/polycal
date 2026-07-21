/**
 * Creates PC Epic + tasks for proposal enforcement UX / admin visibility / CI Node 24.
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

const epicKey = await createIssue({
  project: { key: "PC" },
  summary: "Proposal enforcement days, admin visibility, icons, CI Node 24",
  issuetype: { name: "Epic" },
  labels: ["REQ-PROP-ENFORCE-UX"],
  description: doc(
    "Bundle: sleeping-partner proposal TTL (days, default 5, auto-delete + notify); hours→days for proposed max and at-risk TTL; remove missing-invitee recovery; admin draft delete; peach chrome only when uninvolved; toggle admins seeing uninvolved proposals; higher-quality event icon watermarks on kanban; bump GHA actions to Node 24 runtimes.",
  ),
});
console.log("epic", epicKey);

const tasks = [
  {
    summary: "Proposal enforcement: days units, sleeping-partner TTL, remove recovery",
    label: "REQ-PROP-ENFORCE-DAYS",
    description:
      "Under proposal enforcement: (1) add sleeping partner proposal auto-delete TTL in days default 5 — delete pending partnership and notify proposer+invitee; (2) change max hours in proposed to days; (3) change at-risk draft TTL to days; (4) remove missing-invitee recovery setting and pending-recovery hold flow entirely. Migrate existing hour values with ceil(hours/24).",
  },
  {
    summary: "Admin draft delete + oversight chrome + uninvolved visibility toggle",
    label: "REQ-PROP-ADMIN-VIS",
    description:
      "Allow admins to delete any draft; gate Delete/Continue in UI to owner or admin. Peach oversight only when admin is not proposer and not invitee. Add poly-group toggle (default ON) for admins seeing proposals they are not involved in.",
  },
  {
    summary: "Higher-quality event icons as kanban card right watermarks",
    label: "REQ-PROP-ICON-WATERMARK",
    description:
      "Rerender higher quality event category icons. On proposal kanban cards place icon justified fully to the right, same height as the card, at 30% opacity.",
  },
  {
    summary: "Bump GitHub Actions to Node 24 runtimes (v5)",
    label: "REQ-CI-NODE24",
    description:
      "Fix Node.js 20 deprecation warnings by bumping actions/checkout, setup-node, upload-artifact, download-artifact from @v4 to @v5 across all workflows.",
  },
];

for (const task of tasks) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: task.summary,
    issuetype: { name: "Task" },
    labels: [task.label],
    parent: { key: epicKey },
    description: doc(task.description),
  });
  console.log("task", key, task.label);
}
