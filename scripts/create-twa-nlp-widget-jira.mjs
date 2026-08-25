/**
 * Creates PC epic + stories for Android TWA NLP compose bar (Play-aligned).
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
  summary: "[Epic] Android TWA NLP compose bar (Play-aligned)",
  issuetype: { name: "Epic" },
  labels: ["REQ-TWA-NLP"],
  description: doc(
    "Home-screen NLP bar in a Bubblewrap Trusted Web Activity (applicationId app.polycal) opens /feed?compose=nlp&q= inside the TWA so the existing New Event (NLP Input) composer confirms before submit. PWA for Apple unchanged. Sideload this epic; Play listing later. Reuses PC-453 compose deep-links; does not ship the widget-only Chrome Custom Tabs APK.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "Web compose deep-links for NLP and New Event",
    "REQ-TWA-NLP-001",
    "/feed?compose=nlp&q= (or description=) opens New Event (NLP Input) with nlpText prefilled and strips params after open. /feed?compose=event&title= opens manual composer. Calendar openCreate stays manual. Sanitize and cap query text.",
  ],
  [
    "Login callback keeps compose query string",
    "REQ-TWA-NLP-002",
    "Signed-in redirect and credentials retry honor a safe same-origin callbackUrl including search params so widget/TWA login resumes the composer. No open redirects.",
  ],
  [
    "Bubblewrap TWA app.polycal plus Digital Asset Links",
    "REQ-TWA-NLP-003",
    "Bubblewrap TWA bound to production HTTPS. Stable applicationId app.polycal. Serve /.well-known/assetlinks.json unauthenticated with debug cert SHA-256 and a documented Play signing slot.",
  ],
  [
    "NLP home-screen bar widget inside the TWA package",
    "REQ-TWA-NLP-004",
    "Widget bar plus one-line IME sheet. Send starts TWA LauncherActivity at /feed?compose=nlp&q= not a Chrome Custom Tab. Empty send opens empty NLP composer. Optional New Event widget allowed.",
  ],
  [
    "Tests docs PWA shortcuts and promotion notes",
    "REQ-TWA-NLP-005",
    "Unit tests for compose-query and callback sanitizer. Playwright compose-deeplink journey including login-resume. Manifest shortcuts. STORE-READINESS: TWA+widget this epic; Play listing deferred. Apple PWA unchanged.",
  ],
];

const keys = [epic];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    parent: { key: epic },
    summary,
    issuetype: { name: "Story" },
    labels: ["REQ-TWA-NLP", label],
    description: doc(description),
  });
  console.log("STORY", key, summary);
  keys.push(key);
}

await transitionInProgress(keys[1]);
console.log("KEYS", keys.join(" "));
