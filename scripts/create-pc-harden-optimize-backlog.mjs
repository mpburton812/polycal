/**
 * Creates Epic + phase tickets for harden/optimize/web-store readiness program.
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
  summary: "Harden, optimize, and web/PWA store-readiness (phases 0–3)",
  issuetype: { name: "Epic" },
  labels: ["REQ-HARDEN-OPT-001"],
  description: doc(
    "Full inspection remediation: Phase 0 security, Phase 1 web/PWA compliance (Terms, self-service delete/export, PWA polish; native packaging deferred), Phase 2 DB/perf indexes and bounded scans, Phase 3 streamline/CI. Promote feature→dev→test after each phase; then test→production.",
  ),
});

const stories = [
  {
    summary: "Phase 0: security harden (tokens, paused session, e2e gates, timing-safe secrets)",
    label: "REQ-HARDEN-P0-001",
    description:
      "Hash password-reset/verify tokens; enforce paused in requireSession; harden e2e/prod gates; timingSafeEqual for cron/e2e/impersonation; re-check alpha-feedback admin; magic-byte uploads; server-side reset IP; push endpoint ownership; never skip JWT pause/sessionVersion refresh; update SECURITY-CHECKLIST.",
  },
  {
    summary: "Phase 1: web/PWA compliance (Terms, delete, export, PWA polish)",
    label: "REQ-HARDEN-P1-001",
    description:
      "Public /terms; self-service account delete with full purge; download-my-data JSON; privacy §8 rewrite; manifest/maskable/apple-touch; SW offline fallback; docs/STORE-READINESS.md. Native Capacitor/TWA deferred.",
  },
  {
    summary: "Phase 2: DB indexes, FK pragma, bound scans, calendar concurrency, caching",
    label: "REQ-HARDEN-P2-001",
    description:
      "Secondary indexes on proposals/invitees/slots/activity_log; PRAGMA foreign_keys=ON; bound conflicts/enforcement/board/schedule queries; calendar sync concurrency cap; avatar Cache-Control; optimizePackageImports for MUI/dayjs.",
  },
  {
    summary: "Phase 3: streamline _core carve, ActionResult, CI lint, e2e hygiene",
    label: "REQ-HARDEN-P3-001",
    description:
      "Finish proposals _core carve; normalize ActionResult to message; thin Feed/PeoplePlaces helpers; changelog archive; lint in CI; shared proposalCard locator; SAFE reclass candidates.",
  },
];

const keys = [];
for (const s of stories) {
  const key = await createIssue({
    project: { key: "PC" },
    summary: s.summary,
    issuetype: { name: "Story" },
    labels: [s.label],
    parent: { key: epic },
    description: doc(s.description),
  });
  keys.push(key);
}

console.log(JSON.stringify({ epic, stories: keys }, null, 2));
