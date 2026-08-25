/**
 * Creates PC epic + stories for Android GitHub Releases, APK update prompt, TWA push→Android tray.
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
  summary: "[Epic] Android GitHub Releases + TWA update/push",
  issuetype: { name: "Epic" },
  labels: ["REQ-ANDROID-REL"],
  description: doc(
    "On production merge, CI publishes a signed PolyCal APK GitHub Release (versionName from change-control, monotonic versionCode). TWA prompts for APK updates with changelog. Web Push + notification delegation delivers Android system notifications with sound when push is enabled.",
  ),
});
console.log("EPIC", epic);

const stories = [
  [
    "CI Android release on production with changelog version",
    "REQ-ANDROID-REL-001",
    "Push to production builds signed assembleRelease, tags android-v{CHANGELOG version}, uploads PolyCal-{version}.apk and release-meta.json. Keystore via GitHub secrets matching assetlinks fingerprint.",
  ],
  [
    "TWA native update prompt with release changelog",
    "REQ-ANDROID-REL-002",
    "On launch, compare installed version to latest android-v* release-meta.json. Dialog shows summary + changes; Update downloads/installs APK; Later snoozes.",
  ],
  [
    "TWA Web Push delivers Android system notifications",
    "REQ-ANDROID-REL-003",
    "Keep DelegationService on. Document VAPID + DAL prerequisites. Profile copy clarifies Android system tray/sound. Smoke-test plan for shade notification.",
  ],
  [
    "Agent rules and docs for Bubblewrap releases",
    "REQ-ANDROID-REL-004",
    "Permanent docs: public manifest, global Bubblewrap, config.json no BOM, bubblewrap update re-applies widgets, Windows dirty .next e2e note. README release/secrets section.",
  ],
];

const keys = [epic];
for (const [summary, label, description] of stories) {
  const key = await create({
    project: { key: "PC" },
    summary,
    issuetype: { name: "Story" },
    parent: { key: epic },
    labels: ["REQ-ANDROID-REL", label],
    description: doc(description),
  });
  keys.push(key);
  console.log(key, summary);
}

for (const key of keys) {
  await transitionInProgress(key);
}

fs.writeFileSync(
  path.join(process.cwd(), ".tmp-android-release-jira-keys.json"),
  JSON.stringify({ epic, keys }, null, 2),
);
console.log("Wrote .tmp-android-release-jira-keys.json");
