/**
 * Structured change control log — the single source of truth for the in-app
 * admin "Code Status" panel. A new entry MUST be added at the top whenever code
 * is promoted to an environment (see docs/DEV-PROMOTION.md). Keep newest first.
 */

export type ChangelogChangeType = "added" | "changed" | "fixed";

export interface ChangelogChange {
  type: ChangelogChangeType;
  description: string;
}

export interface ChangelogEntry {
  /** Human-readable version label (date-based) for this promotion. */
  version: string;
  /** ISO date (YYYY-MM-DD) the version was cut for promotion. */
  date: string;
  /** One-line summary shown inline in the Code Status panel. */
  summary: string;
  changes: ChangelogChange[];
}

/**
 * Change control log, newest first. Add a new entry per promotion.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2026.07.09",
    date: "2026-07-09",
    summary:
      "Production release: Sprint A/B E2E coverage, security hardening, and proposal services refactor.",
    changes: [
      {
        type: "added",
        description:
          "Impersonation, overlap/revoke, passive-user, and notification inbox user journey E2E specs (PC-86/88/87/91).",
      },
      {
        type: "changed",
        description:
          "Shared action context helpers adopted across schedule, impersonation, profile, and user provisioning (PC-97).",
      },
      {
        type: "changed",
        description:
          "Proposal at-risk and vote-reset logic extracted to lib services (PC-98).",
      },
      {
        type: "fixed",
        description:
          "Security hardening from assessment remediation: avatar IDOR, E2E API secret, impersonation secret, session invalidation on password change.",
      },
    ],
  },
  {
    version: "2026.07.08",
    date: "2026-07-08",
    summary:
      "Sprint B: proposal services split, passive-user and notification inbox E2E journeys.",
    changes: [
      {
        type: "changed",
        description:
          "Extracted at-risk, vote reset, and state-log services from proposals _core (PC-98).",
      },
      {
        type: "added",
        description:
          "E2E passive-user journey: create passive profile, admin activate, first login (PC-87).",
      },
      {
        type: "added",
        description:
          "E2E notification inbox journey with Accept, Dismiss, and Clear all helpers (PC-91).",
      },
    ],
  },
  {
    version: "2026.07.07",
    date: "2026-07-07",
    summary:
      "Sprint A: impersonation and overlap E2E journeys; shared action context adoption.",
    changes: [
      {
        type: "added",
        description:
          "E2E impersonation journey covering dev bar and admin-panel impersonation with audit log verification (PC-86).",
      },
      {
        type: "added",
        description:
          "E2E overlap/revoke journey: in-flight overlap warning, acknowledge, and revoke acceptance (PC-88).",
      },
      {
        type: "changed",
        description:
          "Adopted requireSession/withDb helpers in schedule, admin impersonation, dev impersonation, profile, and user provisioning actions (PC-97).",
      },
    ],
  },
  {
    version: "2026.07.04",
    date: "2026-07-04",
    summary:
      "Admin Code Status panel with build info, change control log, and Check for Update.",
    changes: [
      {
        type: "added",
        description:
          "Admin Code Status panel: shows the live build number and when it went live in the current environment; click the build number for the full change control log.",
      },
      {
        type: "added",
        description:
          "Check for Update button that force-reloads to the newest build when the deployment has changed.",
      },
      {
        type: "added",
        description:
          "Structured change control log updated on every environment promotion, plus a /api/build-info endpoint.",
      },
      {
        type: "changed",
        description:
          'Replaced the admin "Force Reload" panel with "Code Status".',
      },
    ],
  },
  {
    version: "2026.07.03",
    date: "2026-07-03",
    summary:
      "All-day events, richer proposal notifications with inline actions, and correct onboarding URLs.",
    changes: [
      {
        type: "added",
        description:
          "All-day event proposals (no clock times) rendered across the schedule, proposal cards, and detail view.",
      },
      {
        type: "added",
        description:
          "Proposal notifications now include when/where detail plus inline Accept and Open Notification actions (in-app and Web Push).",
      },
      {
        type: "fixed",
        description:
          "Onboarding sign-in URL is derived from the running deployment instead of always pointing at production.",
      },
    ],
  },
  {
    version: "2026.06.30",
    date: "2026-06-30",
    summary: "Garden Brutalism theme and cloud development setup docs.",
    changes: [
      {
        type: "changed",
        description: "Garden Brutalism and Playful Collective theme across the app.",
      },
      {
        type: "added",
        description: "AGENTS.md cloud development environment setup notes.",
      },
    ],
  },
];

/** Most recent change control entry, or null when the log is empty. */
export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG[0] ?? null;
}
