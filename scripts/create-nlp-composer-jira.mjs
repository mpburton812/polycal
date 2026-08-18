/**
 * Creates PC epic + stories for split New Event vs NLP composer (sleeping Booking-for).
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
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

if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
  console.error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN");
  process.exit(1);
}

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

const epic = await create({
  project: { key: "PC" },
  summary: "[Epic] Split New Event vs NLP composer with sleeping Booking-for",
  issuetype: { name: "Epic" },
  labels: ["REQ-NLP-COMPOSER"],
  description: doc(
    "FAB: New Event (manual progressive disclosure) then New Event (NLP Input). NLP starts from Description and fills Booking-for when a named sleeper is not the viewer. If Bookings are off, toast Booking for others is not enabled.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "FAB New Event and New Event (NLP Input) entry points",
    "REQ-NLP-COMPOSER-001",
    "New Event first (manual). New Event (NLP Input) second. Calendar shortcuts stay on the manual composer.",
  ],
  [
    "Manual New Event progressive Title, type, posting, calendar, Who, Where",
    "REQ-NLP-COMPOSER-002",
    "Drop NLP Description from New Event. Reveal Title then Social/Sleeping then posting then calendar then Who then Where. Who still updates Where homes.",
  ],
  [
    "NLP composer Description-first with unanswered questions",
    "REQ-NLP-COMPOSER-003",
    "Start with Description only. Infer Sleeping vs Social. Named sleeper becomes Booking-for when Bookings are enabled; otherwise toast Booking for others is not enabled.",
  ],
  [
    "Sleeping NLP sleeper vs host, alone, their place, weekend nights",
    "REQ-NLP-COMPOSER-004",
    "Parse spending the night and staying at. Possessive place is host. Alone is solo at that place. Their place is the sleeper home. This weekend is Friday and Saturday nights.",
  ],
];

const keys = [epic];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    parent: { key: epic },
    summary,
    issuetype: { name: "Story" },
    labels: ["REQ-NLP-COMPOSER", label],
    description: doc(description),
  });
  console.log("STORY", key, summary);
  keys.push(key);
}

await transitionInProgress(keys[1]);
console.log("KEYS", keys.join(" "));
