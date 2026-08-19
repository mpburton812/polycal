/**
 * Creates PC epic + stories for Android homescreen compose widgets.
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
  summary: "[Epic] Android homescreen widgets for quick event add",
  issuetype: { name: "Epic" },
  labels: ["REQ-ANDROID-WIDGETS"],
  description: doc(
    "Two independently placeable Android home-screen widgets (standard New Event and Natural language add) plus web compose deep-links on /feed. Widgets launch Chrome Custom Tabs to the live PWA so Auth.js session is reused. Empty widget tap opens the matching empty composer; submitted text prefills title or nlpText. Existing ProposalDraftDialog create/submit pipeline is reused. Login must preserve callback query strings.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Web compose deep-links open New Event and NLP composers from /feed query",
    "REQ-ANDROID-WIDGETS-001",
    "Authenticated /feed?compose=event&title= and /feed?compose=nlp&q= (or description=) open ProposalDraftDialog with composerMode manual vs nlp and initialTitle / initialNlpText. Sanitize length and unexpected params. Strip compose params after open so refresh does not re-open. Empty params still open the matching empty composer.",
  ],
  [
    "Preserve login callbackUrl pathname and query for compose resume",
    "REQ-ANDROID-WIDGETS-002",
    "middleware.ts currently sets callbackUrl to pathname only. Preserve pathname + search (same-origin relative path, no open redirect). Login page uses the sanitized callback when already signed in, after credentials success, and when retrying after CredentialsSignin.",
  ],
  [
    "PWA manifest shortcuts for New Event and Natural language add",
    "REQ-ANDROID-WIDGETS-003",
    "Add Web App Manifest shortcuts for /feed?compose=event and /feed?compose=nlp so long-press on the installed icon can open either composer. Does not replace Android widgets.",
  ],
  [
    "Android App Widget module launches compose URLs in Custom Tabs",
    "REQ-ANDROID-WIDGETS-004",
    "Small android-widgets project with two AppWidgetProviders (PolyCal: New Event and PolyCal: Natural language), single-line field plus send, garden colors, configurable base URL. Chrome/hint tap opens empty composer; send-with-text prefills. Launch HTTPS compose URLs via Chrome Custom Tabs / VIEW intent, not a Capacitor WebView. README for debug APK sideload. Not full Play/TWA distribution.",
  ],
  [
    "Tests and docs for compose widgets and login resume",
    "REQ-ANDROID-WIDGETS-005",
    "Vitest for compose query parse/sanitize and safe callback paths. Playwright: /feed?compose=event&title= opens New Event with title; NLP equivalent; login-resume if practical. Update STORE-READINESS, changelog, and .env.example host URL note.",
  ],
];

const keys = [epic];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    parent: { key: epic },
    summary,
    issuetype: { name: "Story" },
    labels: ["REQ-ANDROID-WIDGETS", label],
    description: doc(description),
  });
  console.log("STORY", key, summary);
  keys.push(key);
}

await transitionInProgress(keys[1]);
console.log("KEYS", keys.join(" "));
