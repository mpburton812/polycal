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
    version: "2026.07.14b",
    date: "2026-07-14",
    summary: "All Day End day typing fix; dates/times journey; 5 Playwright shards.",
    changes: [
      {
        type: "fixed",
        description:
          "All Day/sleeping date range no longer swaps Day when typing partial End day (PC-209).",
      },
      {
        type: "added",
        description:
          "dates-times-journey covers Window/All Day/Poll/Recurring valid and invalid When fields (PC-210).",
      },
      {
        type: "changed",
        description: "Playwright CI matrix expanded from 4 to 5 shards (PC-211).",
      },
    ],
  },
  {
    version: "2026.07.14",
    date: "2026-07-14",
    summary: "Branded notification email verification landing.",
    changes: [
      {
        type: "added",
        description:
          "Public /verify-email success/error page with Continue to PolyCal; mail links updated; /api/verify-email redirects for old emails (PC-207).",
      },
    ],
  },
  {
    version: "2026.07.13c",
    date: "2026-07-13",
    summary: "Branded splash, tab swipe, Day schedule view, View options legend cleanup.",
    changes: [
      {
        type: "added",
        description:
          "Garden-branded loading splash, streamed app shell, and PWA Updating PolyCal cue after deploys (PC-202).",
      },
      {
        type: "added",
        description: "Swipe left/right on main content to navigate bottom tabs (PC-203).",
      },
      {
        type: "added",
        description:
          "Schedule Day period with 12a–12a hour grid and all-day events strip (PC-204).",
      },
      {
        type: "changed",
        description: "Removed status legend from schedule View options drawer (PC-205).",
      },
    ],
  },
  {
    version: "2026.07.13b",
    date: "2026-07-13",
    summary: "Remove place members; residency self-join person UX.",
    changes: [
      {
        type: "added",
        description:
          "Owners/admins can remove accepted Residents or Owners from the place card; last owner protected; audit places.remove_person (PC-199).",
      },
      {
        type: "fixed",
        description:
          "Residency proposal dialog uses read-only Requesting for: you instead of a grayed Person select (PC-200).",
      },
    ],
  },
  {
    version: "2026.07.13",
    date: "2026-07-13",
    summary: "Place role toggle, onboarding email/TZ, mobile Add Place, admin oversight chrome.",
    changes: [
      {
        type: "added",
        description:
          "Owners/admins can change accepted place members between Resident and Owner; last-owner demotion blocked (PC-193).",
      },
      {
        type: "added",
        description:
          "Onboarding collects notification email (verify link; finish not blocked) and timezone defaulting to America/New_York (PC-194).",
      },
      {
        type: "fixed",
        description:
          "People & Places Add place / Add person remain usable on small screens (PC-195).",
      },
      {
        type: "added",
        description:
          "Admin-viewed proposals belonging to others use a light orange background on the board and in detail (PC-196).",
      },
      {
        type: "changed",
        description:
          "Sleeping Partner Proposal list includes passive profiles (auto-accept) (PC-197).",
      },
    ],
  },
  {
    version: "2026.07.12c",
    date: "2026-07-12",
    summary: "Place owners, immediate add, self-join owner approval.",
    changes: [
      {
        type: "added",
        description:
          "location_residents.place_role (owner/resident); creators seeded as owners (PC-186).",
      },
      {
        type: "added",
        description:
          "Owners/admins add people immediately as Owner or Resident from Places (PC-187, PC-189).",
      },
      {
        type: "changed",
        description:
          "Residency self-join proposals invite place owners; proposer selects Owner or Resident access (PC-188).",
      },
      {
        type: "added",
        description:
          "Residency place picker shows current owners and residents (PC-190).",
      },
    ],
  },
  {
    version: "2026.07.12b",
    date: "2026-07-12",
    summary: "Alpha Feedback screenshot lightbox, comment log, notify on Save.",
    changes: [
      {
        type: "added",
        description:
          "Alpha Feedback tracker: click screenshot to view full size (PC-182).",
      },
      {
        type: "added",
        description:
          "Alpha Feedback: dated comment log on Save; draft fields clear after append (PC-183).",
      },
      {
        type: "changed",
        description:
          "Alpha Feedback: remove Notify Submitter button; Save notifies when a submitter comment is present (PC-184).",
      },
    ],
  },
  {
    version: "2026.07.12a",
    date: "2026-07-12",
    summary: "Recurring modes, admin mobile rows, production impersonation.",
    changes: [
      {
        type: "changed",
        description:
          "Window/All Day/Poll exclusive; Recurring combinable; recurrence UI under dates (PC-170, PC-171).",
      },
      {
        type: "added",
        description:
          "Restore colored environment banners (DEV red / TEST yellow) via DevBar (PC-172).",
      },
      {
        type: "changed",
        description:
          "Admin User management uses two-line stacked cards on phone screens (PC-178).",
      },
      {
        type: "changed",
        description:
          "Admin impersonation works in production when AUTH_IMPERSONATION_SECRET is set (PC-179).",
      },
      {
        type: "changed",
        description:
          "People & Places tab label MAP renamed to Sleeping Partners (PC-180).",
      },
    ],
  },
  {
    version: "2026.07.11e",
    date: "2026-07-11",
    summary: "E2E speedup: shared CI build, auth storageState, SAFE_PARALLEL workers.",
    changes: [
      {
        type: "changed",
        description:
          "Playwright CI builds Next once and shares .next across shards (PC-174).",
      },
      {
        type: "changed",
        description:
          "Seed-user JWT storageState + login fast-path; empty storage for auth/reset specs (PC-175).",
      },
      {
        type: "changed",
        description:
          "SAFE_PARALLEL project uses per-worker DBs/ports; SERIAL_ONLY stays workers:1 (PC-176).",
      },
    ],
  },
  {
    version: "2026.07.11d",
    date: "2026-07-11",
    summary: "Fix hosted DB missing password_reset_token columns (schema v21).",
    changes: [
      {
        type: "fixed",
        description:
          "Bump SCHEMA_VERSION to 21 so password_reset_token columns apply on test/production Turso (PC-168).",
      },
    ],
  },
  {
    version: "2026.07.11c",
    date: "2026-07-11",
    summary: "Schedule UX: chrome, day sheet, create FAB, mobile agenda, URL/a11y.",
    changes: [
      {
        type: "changed",
        description:
          "Unified Week / 2 weeks / Month control; View options sheet; Today; Garden heatmap/month cells (PC-164).",
      },
      {
        type: "added",
        description:
          "Month/compact day sheet, create-from-calendar FAB, fallback month icons (PC-165).",
      },
      {
        type: "added",
        description:
          "Mobile agenda week list; recurrence opens occurrence directly (PC-166).",
      },
      {
        type: "changed",
        description:
          "Schedule URL sync for layout/anchor/open; a11y labels; planning empty state (PC-167).",
      },
    ],
  },
  {
    version: "2026.07.11b",
    date: "2026-07-11",
    summary: "Email: Resend on polycal.net, credentials mail, self-service password reset.",
    changes: [
      {
        type: "added",
        description:
          "Self-service forgot/reset password via verified notification email (PC-162).",
      },
      {
        type: "added",
        description:
          "Optional notification email on create/activate; credentials emailed with clipboard fallback (PC-161).",
      },
      {
        type: "changed",
        description:
          "Verify links use getPublicAppUrl; hide token when Resend succeeds; quiet hours apply to email (PC-160).",
      },
    ],
  },
  {
    version: "2026.07.11a",
    date: "2026-07-11",
    summary: "User UX: provision roles, onboarding OK, hide deleted users, wrap cards.",
    changes: [
      {
        type: "changed",
        description:
          "Non-admin provisioners can only create User accounts; Admin role picker is admin-only (PC-155).",
      },
      {
        type: "changed",
        description:
          "Onboarding Welcome requires OK before entering the app; complete only on acknowledge (PC-156).",
      },
      {
        type: "changed",
        description:
          "Soft-deleted users no longer appear in Admin user management (PC-157).",
      },
      {
        type: "changed",
        description:
          "Proposal cards, mode grid, admin table, and poll responses wrap without horizontal swipe (PC-158).",
      },
    ],
  },
  {
    version: "2026.07.10g",
    date: "2026-07-10",
    summary: "UX cleanup: schedule modes, date range, toast, sleeping titles, detach fix.",
    changes: [
      {
        type: "fixed",
        description:
          "Detach night/day from series no longer fails with Failed query (notify after commit) (PC-147).",
      },
      {
        type: "changed",
        description: "Toast snackbar centered vertically so it does not cover bottom nav (PC-148).",
      },
      {
        type: "changed",
        description:
          "Removed build/branch top banner; impersonation under Admin → Test data (PC-149).",
      },
      {
        type: "changed",
        description:
          "Sleeping titles without brackets: Sleeping: Name, Status, at Place (PC-150).",
      },
      {
        type: "changed",
        description: "Tighter vertical padding on event icon picker and card icon rows (PC-151).",
      },
      {
        type: "added",
        description:
          "Draft schedule type grid: Window / All Day / Poll / Recurring; Poll greys out Recurring (PC-152).",
      },
      {
        type: "added",
        description:
          "Two-click calendar range for all-day events and sleeping nights (PC-153).",
      },
    ],
  },
  {
    version: "2026.07.10f",
    date: "2026-07-10",
    summary: "Loading UX for detail dialog and tabs; faster layout/schedule fetch.",
    changes: [
      {
        type: "added",
        description:
          "Proposal detail skeleton while loading; Close deferred until detail ready (PC-138).",
      },
      {
        type: "added",
        description:
          "Route loading shells for people-places, admin, and app layout (PC-139).",
      },
      {
        type: "changed",
        description:
          "Parallelize app layout inbox/prefs/group/admin fetches (PC-140).",
      },
      {
        type: "changed",
        description:
          "Skip schedule client refetch when initial week matches current Monday (PC-141).",
      },
    ],
  },
  {
    version: "2026.07.10e",
    date: "2026-07-10",
    summary: "Privacy option gating; alpha feedback archive and delete.",
    changes: [
      {
        type: "changed",
        description:
          "Hide disabled private/super-private options on new proposals; enforce in draft save (PC-134).",
      },
      {
        type: "added",
        description:
          "Alpha feedback permanent DELETE and ARCHIVE list with toolbar navigation (PC-135, PC-136).",
      },
    ],
  },
  {
    version: "2026.07.10d",
    date: "2026-07-10",
    summary: "ESLint config, tracker React align, draft dialog split.",
    changes: [
      {
        type: "added",
        description:
          "Committed ESLint flat config; pin eslint-config-next to Next 15; lint is non-interactive (PC-130).",
      },
      {
        type: "changed",
        description:
          "Align tracker React/types with root; document separate package (no workspaces) in ARCHITECTURE (PC-131).",
      },
      {
        type: "changed",
        description:
          "Extract ProposalDraftDialog event/sleeping/more-options and conflict confirm sections (PC-132).",
      },
    ],
  },
  {
    version: "2026.07.10c",
    date: "2026-07-10",
    summary: "CI for alpha-feedback tracker web build; GitLab CI marked secondary.",
    changes: [
      {
        type: "added",
        description:
          "Path-filtered GitHub Actions job typechecks and Vite-builds apps/alpha-feedback-tracker (PC-128).",
      },
      {
        type: "changed",
        description:
          "Document GitLab CI as secondary/legacy; architecture notes for tracker package boundary (PC-128).",
      },
    ],
  },
  {
    version: "2026.07.10b",
    date: "2026-07-10",
    summary: "Proposal card & draft form UX for events and sleeping.",
    changes: [
      {
        type: "changed",
        description:
          "Board cards use what→when→where→act hierarchy with sparse badges and type accent (PC-124).",
      },
      {
        type: "changed",
        description:
          "Event schedule pickers use digital time; Reschedule uses ProposalScheduleField (PC-125).",
      },
      {
        type: "changed",
        description:
          "Type-aware progressive draft dialog with More options, Required/Optional invitees, Save vs Submit (PC-126).",
      },
      {
        type: "changed",
        description:
          "Privacy/notes helper copy and E2E updates for event and sleeping journeys (PC-127).",
      },
    ],
  },
  {
    version: "2026.07.10",
    date: "2026-07-10",
    summary: "Custom avatar crop: zoom out, WYSIWYG preview, and black-image fix.",
    changes: [
      {
        type: "fixed",
        description:
          "Custom avatar crop uses react-easy-crop with zoom-out (0.5×–3×) and load-gated confirm (PC-112).",
      },
      {
        type: "fixed",
        description:
          "Avatar export fills JPEG background and rejects empty crops server-side to prevent black avatars (PC-112).",
      },
    ],
  },
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
