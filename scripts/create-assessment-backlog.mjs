/**
 * Creates assessment remediation epics PC-78–PC-81 and child tasks (codebase assessment plan).
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
  console.error("Missing JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN in .env.local");
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

const EPICS = [
  {
    label: "PC-78",
    summary: "Security hardening (codebase assessment)",
    description:
      "Epic from full codebase assessment: E2E route guards, impersonation secrets, session invalidation, avatar IDOR, HTTP headers, SW cache, rate limits, env validation.",
    tickets: [
      {
        id: "PC-78-1",
        summary: "Harden E2E API routes with secret header and prod guard",
        description:
          "Require E2E_API_SECRET header; block when NEXT_PUBLIC_APP_ENV=production; tighten middleware allowlist for /api/e2e.",
      },
      {
        id: "PC-78-2",
        summary: "Require dedicated AUTH_IMPERSONATION_SECRET; disable impersonation in production",
        description:
          "Remove AUTH_SECRET fallback for impersonation in auth.ts, admin.ts, dev.ts.",
      },
      {
        id: "PC-78-3",
        summary: "Bump sessionVersion on self-service password change",
        description:
          "changePasswordAction and setInitialPasswordAction increment sessionVersion like admin password reset.",
      },
      {
        id: "PC-78-4",
        summary: "Fix avatar IDOR on /api/avatars/[id]",
        description: "Authorize owner or network relationship before streaming custom avatars.",
      },
      {
        id: "PC-78-5",
        summary: "Add HTTP security headers in next.config.ts",
        description: "HSTS, X-Frame-Options, X-Content-Type-Options, baseline CSP.",
      },
      {
        id: "PC-78-6",
        summary: "Exclude authenticated GET /api/* from service worker cache",
        description: "Serwist NetworkOnly for sensitive API paths in src/sw.ts.",
      },
      {
        id: "PC-78-7",
        summary: "Extend rate limiting beyond login",
        description: "Password reset and email verification; document serverless limitation.",
      },
      {
        id: "PC-78-8",
        summary: "Runtime DB URL vs environment tier validation",
        description: "Startup guard in src/lib/env.ts: production must not use file: URLs.",
      },
      {
        id: "PC-78-9",
        summary: "Redact verification tokens from activity log",
        description: "profile.ts must not log full verificationUrl when email unsent.",
      },
      {
        id: "PC-78-10",
        summary: "Document admin capability matrix",
        description: "userHasAdminAccess vs role===admin split in ARCHITECTURE or SECURITY-CHECKLIST.",
      },
    ],
  },
  {
    label: "PC-79",
    summary: "User flow and E2E coverage gaps",
    description: "Epic from codebase assessment: uncovered journeys, mobile viewport, empty states, notification inbox actions.",
    tickets: [
      {
        id: "PC-79-1",
        summary: "E2E impersonation journey (dev bar + admin panel)",
        description: "e2e/impersonation-journey.spec.ts — switch user, assert identity, audit log.",
      },
      {
        id: "PC-79-2",
        summary: "E2E passive user create + activation journey",
        description: "Passive user lifecycle and re-validation queue on first login.",
      },
      {
        id: "PC-79-3",
        summary: "E2E in-flight overlap warning + Revoke Acceptance",
        description: "e2e/overlap-revoke-journey.spec.ts.",
      },
      {
        id: "PC-79-4",
        summary: "E2E collision auto-decline on resolve",
        description: "Transaction collision side effect when proposal resolves.",
      },
      {
        id: "PC-79-5",
        summary: "E2E post-resolution removal leads to at-risk",
        description: "Proposer removes invitee; self-revoke ACCEPT flows.",
      },
      {
        id: "PC-79-6",
        summary: "E2E notification inbox delete/clear/action buttons",
        description: "Extend e2e/helpers/notifications.ts and add journey spec.",
      },
      {
        id: "PC-79-7",
        summary: "Mobile viewport Playwright project + smoke tests",
        description: "Mobile Chrome project: bottom nav, FAB, month icons, proposal vote.",
      },
      {
        id: "PC-79-8",
        summary: "E2E empty states for new users",
        description: "Assert No drafts yet and empty planning drawer.",
      },
      {
        id: "PC-79-9",
        summary: "E2E at-risk / proposed TTL / archival enforcement",
        description: "Cron-driven journey similar to event-reminder-journey.",
      },
      {
        id: "PC-79-10",
        summary: "E2E Super Private masking",
        description: "Extend e2e/privacy-masking.spec.ts for super_private events.",
      },
    ],
  },
  {
    label: "PC-80",
    summary: "Code standardization",
    description: "Epic: ARCHITECTURE docs, action context helpers, proposals split, theme migration, ESLint/deps.",
    tickets: [
      {
        id: "PC-80-1",
        summary: "Add src/lib/actions/context.ts (requireSession, withDb)",
        description: "Shared auth+DB wrapper; adopt in top server actions.",
      },
      {
        id: "PC-80-2",
        summary: "Finish proposals _core.ts split into lib services",
        description: "Extract from _core.ts into src/lib/proposals/services/; thin action facades.",
      },
      {
        id: "PC-80-3",
        summary: "Complete GARDEN_TOKENS theme migration",
        description: "Remove deprecated POLY_GREEN and typeChipSx from proposal dialogs.",
      },
      {
        id: "PC-80-4",
        summary: "Consolidate legacy residency bridge",
        description: "Single entry point for bridgeLegacyResidencyProposals.",
      },
      {
        id: "PC-80-5",
        summary: "ESLint flat config or remove broken lint script",
        description: "eslint.config.mjs aligned with Next 15 or drop npm run lint.",
      },
      {
        id: "PC-80-6",
        summary: "Dependency alignment plan",
        description: "next-auth stable, eslint-config-next vs Next 15, MUI core vs X majors.",
      },
    ],
  },
  {
    label: "PC-81",
    summary: "Tech debt cleanup",
    description: "Epic: repo hygiene, orphaned files, CHANGELOG, action test harness, mega-file refactors.",
    tickets: [
      {
        id: "PC-81-1",
        summary: "Repo hygiene — gitignore agent artifacts",
        description: "Ignore e2e-*.txt, pr*-*.txt; remove tracked scratch files from root.",
      },
      {
        id: "PC-81-2",
        summary: "Delete orphaned AdminForceReloadPanel",
        description: "Removed in favor of AdminCodeStatusPanel.",
      },
      {
        id: "PC-81-3",
        summary: "Normalize CHANGELOG Unreleased sections",
        description: "Single Added/Changed/Fixed blocks per release section.",
      },
      {
        id: "PC-81-4",
        summary: "Server-action Vitest harness",
        description: "Mock auth + e2e.db; tests for vote and schedule list actions.",
      },
      {
        id: "PC-81-5",
        summary: "Template directory policy",
        description: "Gitignore template/ export or commit as productized workflow starter.",
      },
      {
        id: "PC-81-6",
        summary: "Refactor ProposalDraftDialog into sub-forms",
        description: "~1400 lines; type-specific form components.",
      },
      {
        id: "PC-81-7",
        summary: "Refactor PeoplePlacesClient into tab-scoped clients",
        description: "~1064 lines split by people/places/map tabs.",
      },
      {
        id: "PC-81-8",
        summary: "Split users.ts admin vs profile modules",
        description: "~1017 lines; separate admin CRUD from profile helpers.",
      },
    ],
  },
];

async function main() {
  const created = [];

  for (const epic of EPICS) {
    const epicKey = await createIssue({
      project: { key: "PC" },
      summary: epic.summary,
      issuetype: { name: "Epic" },
      description: adfParagraph(`${epic.label}: ${epic.description}`),
    });
    console.log(`Epic ${epic.label}:`, epicKey);

    const tickets = [];
    for (const ticket of epic.tickets) {
      const key = await createIssue({
        project: { key: "PC" },
        summary: `[${ticket.id}] ${ticket.summary}`,
        issuetype: { name: "Task" },
        description: adfParagraph(ticket.description),
        parent: { key: epicKey },
      });
      tickets.push({ ref: ticket.id, key, summary: ticket.summary });
      console.log("  Created:", key, ticket.summary);
    }

    created.push({ epicRef: epic.label, epicKey, tickets });
  }

  console.log("\n--- Assessment backlog created ---");
  console.log(JSON.stringify(created, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
