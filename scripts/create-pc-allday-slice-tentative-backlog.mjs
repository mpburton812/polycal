/**
 * Creates PC Epic + bugs for all-day slice span, admin error logging, and
 * batch sleeping Tentative title after resolve (prod/test reports Jul 2026).
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

if (!baseUrl || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
  throw new Error("Missing JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN in .env.local");
}

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
    summary: "All-day calendar span, slice open error, admin error log, batch Tentative title",
    issuetype: { name: "Epic" },
    labels: ["REQ-CAL-SLICE-001"],
    description: doc(
      "Production/test: single-day all-day event (e.g. test of poke, Sat 7/25) spans two calendar days; opening from Schedule fails with Day not part of a multi-day span. Those errors must appear in System administrator log. Batch sleeping proposals keep Tentative in the persisted title after resolve. Align all-day TZ encoding with PC-258/PC-282, fix slice membership TZ, log action errors, refresh sleeping titles on resolve.",
    ),
  },
});
console.log("EPIC", epic.key);

const bugs = [
  [
    "Bug",
    "Single-day all-day spans two days and slice open fails",
    "REQ-CAL-SLICE-002. Repro: create all-day event for one Saturday; calendar shows two days; tap fails Day not part of a multi-day span. Likely causes: localDateToEndIso host-locale vs profile TZ; validateSliceMembership uses DEFAULT_VIEWER_TIMEZONE while listScheduleEvents uses viewer TZ; week/agenda place inclusive startKey..endKey for end-of-day ISO. Fix: TZ-safe all-day bounds (noon or same-day end), pass viewer TZ into membership, single-day never virtual_span_day, week/day place all-day on start day only when same civil day. Add unit + journey coverage.",
  ],
  [
    "Bug",
    "Slice/action errors must write System administrator log",
    "REQ-CAL-SLICE-003. Errors such as Day not part of a multi-day span currently toast/UI only. On getProposalSliceDetailAction (and related slice detach/tag failures), call logUserActivity(..., eventType error) so Admin → System administrator log shows them. Label action codes for activity-log-display.",
  ],
  [
    "Bug",
    "Batch sleeping title stays Tentative after resolve",
    "REQ-CAL-SLICE-004. resolveProposal updates state to resolved but does not regenerate formatSleepingDisplayTitle (Tentative→Confirmed). Submit path updates title; Feed/notifications use raw proposals.title so Tentative sticks. Fix: rebuild sleeping/batch title in resolveProposal (and any other resolve paths); ensure Feed uses Confirmed or refreshed title; optional one-off backfill for existing resolved rows.",
  ],
];

for (const [issuetype, summary, description] of bugs) {
  const issue = await jira("issue", {
    fields: {
      project: { key: "PC" },
      summary,
      issuetype: { name: issuetype },
      parent: { key: epic.key },
      description: doc(description),
    },
  });
  console.log(issuetype.toUpperCase(), issue.key, summary);
}
