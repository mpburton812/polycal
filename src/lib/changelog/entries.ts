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
