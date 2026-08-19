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

import { CHANGELOG_ARCHIVE } from "./entries.archive";

/**
 * Change control log, newest first. Add a new entry per promotion.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "2026.08.19d",
    date: "2026-08-19",
    summary:
      "CI reuses the e2e Next build on promotion PRs and caches Playwright browsers for production (PC-452).",
    changes: [
      {
        type: "changed",
        description:
          "dev.yml and test.yml drop a second Next build; e2e.yml remains the PR compile gate (PC-452).",
      },
      {
        type: "changed",
        description:
          "production.yml caches Playwright Chromium under ~/.cache/ms-playwright (PC-452).",
      },
    ],
  },
  {
    version: "2026.08.19c",
    date: "2026-08-19",
    summary:
      "Proposal mutations patch local detail; one shared draft dialog host (PC-451).",
    changes: [
      {
        type: "changed",
        description:
          "Votes, comments, attendees, and feed post reload proposal detail without a full RSC refresh unless the card changes columns (PC-451).",
      },
      {
        type: "changed",
        description:
          "ProposalDraftDialog lives only on the sage create host; Proposals and Schedule open it via openEdit (PC-451).",
      },
    ],
  },
  {
    version: "2026.08.19b",
    date: "2026-08-19",
    summary:
      "SCHEMA_VERSION 51 network/feed indexes; scoped place residents and schedule slot scans (PC-450).",
    changes: [
      {
        type: "changed",
        description:
          "Covering indexes on proposals.network_id, state log, comments, locations, sleeping partnerships, and feed chat (PC-450).",
      },
      {
        type: "changed",
        description:
          "listPlaces loads residents only for network locations; schedule slot prefilter joins proposals.network_id (PC-450).",
      },
    ],
  },
  {
    version: "2026.08.19a",
    date: "2026-08-19",
    summary:
      "Sage create menu opens immediately; composer lists load in one bootstrap action (PC-448–PC-449).",
    changes: [
      {
        type: "changed",
        description:
          "FAB plus no longer waits on six server actions before the menu appears; dialogs mount only when opened (PC-449).",
      },
      {
        type: "changed",
        description:
          "Place member names batch in one query and composer Who-chip rank is viewer-scoped SQL (PC-449).",
      },
    ],
  },
  {
    version: "2026.08.18c",
    date: "2026-08-18",
    summary:
      "New Event selection styling, proposed Cancel Event / Back to Draft, FAB off Feed and People & Places, Admin Event Types Just Bookings (PC-443–PC-447).",
    changes: [
      {
        type: "changed",
        description:
          "New Event keeps Social/Sleeping and Proposal/Booking chips sage-green; posting is labeled Proposal or Booking with a voted vs auto-accepted caption; Batch nights is removed from new sleeping drafts (PC-444).",
      },
      {
        type: "changed",
        description:
          "Proposed detail always shows Cancel Event, drops Delete proposal and Reschedule, and adds Back to Draft to reopen the composer (PC-445).",
      },
      {
        type: "changed",
        description:
          "Sage create FAB is hidden on Feed and People & Places; it remains on Schedule and Proposals (PC-446).",
      },
      {
        type: "added",
        description:
          "Admin Event Types includes Just Bookings, which forces calendar bookings on New Event, turns Poll off, and leaves sleeping-partner and residency proposals unchanged (PC-447).",
      },
    ],
  },
  {
    version: "2026.08.18b",
    date: "2026-08-18",
    summary:
      "Split New Event vs NLP composer; sleeping NLP books for a named sleeper (PC-438–PC-442).",
    changes: [
      {
        type: "changed",
        description:
          "FAB lists New Event then New Event (NLP Input); calendar create stays on the manual composer (PC-439).",
      },
      {
        type: "changed",
        description:
          "Manual composer is Title-first: type, posting, calendar, then Who and Where after dates (PC-440).",
      },
      {
        type: "changed",
        description:
          "NLP composer is Description-first; a named sleeper becomes Booking-for, or toasts when bookings are off (PC-441).",
      },
      {
        type: "changed",
        description:
          "Sleeping NLP parses sleeps/staying/spending the night, host vs sleeper, alone, their place, and Fri–Sat weekend nights (PC-442).",
      },
    ],
  },
  {
    version: "2026.08.18a",
    date: "2026-08-18",
    summary:
      "New Event composer: NLP Description, calendar tap/drag, Who chips, Where homes; Admin Network Configuration (PC-432–PC-437).",
    changes: [
      {
        type: "changed",
        description:
          "New Event Description parses title, dates, times, people, and places; chips visualize Title/Date/Time/Location (PC-433).",
      },
      {
        type: "changed",
        description:
          "Calendar tap/drag replaces Window vs All Day; Social Add times slider; Poll and Recurring move to More options (PC-434).",
      },
      {
        type: "changed",
        description:
          "Who avatar chips tap-cycle required/optional/booked with ranking; empty Who is Solo (PC-435).",
      },
      {
        type: "changed",
        description:
          "Where shows homes of selected people (My Place first, or Booking-for); custom location unchanged (PC-436).",
      },
      {
        type: "changed",
        description:
          "Admin Network → Network Summary & MOTD; Network settings → Network Configuration with regrouped subsections (PC-437).",
      },
    ],
  },
  {
    version: "2026.08.17b",
    date: "2026-08-17",
    summary:
      "Proposals and Bookings: New Event composer, Booked attendees, Post to Feed (PC-426–PC-431).",
    changes: [
      {
        type: "changed",
        description:
          "Admin posting mode is Proposals and Bookings; Booking for replaces the Proxy Scheduling slider (PC-428). SCHEMA_VERSION 50.",
      },
      {
        type: "changed",
        description:
          "FAB New Event (unlocked type) and Bulk Sleep Booking; Sleeping proposal removed; Save is gone; Submit vs Add to calendar (PC-429).",
      },
      {
        type: "added",
        description:
          "Resolved events: Cancel Event, Booked invitee role with auto-accept notify, Post to Feed milestone (PC-430).",
      },
    ],
  },
  {
    version: "2026.08.17a",
    date: "2026-08-17",
    summary:
      "Proposal UX: shared create FAB, profile Feedback, Poll/Schedule/Proxy admin gates (PC-417–PC-425).",
    changes: [
      {
        type: "added",
        description:
          "Sage create FAB with the full Event/Sleeping/FastSleep/partner/residency menu on every authenticated screen (PC-418).",
      },
      {
        type: "changed",
        description:
          "Feedback lives in the profile menu after Admin (and Platform admin), before Logout; terracotta FAB removed (PC-419).",
      },
      {
        type: "fixed",
        description:
          "Location pickers are network-scoped and omit orphan places with no accepted residents who are members (PC-420).",
      },
      {
        type: "changed",
        description:
          "New drafts start with Window and With invitees unset; When fields and people lists fly out after a choice (PC-421).",
      },
      {
        type: "changed",
        description:
          "Composer header keeps heading plus Batch/Poll/Schedule chips; EVENT/SLEEPING PROPOSAL, DRAFT, and by-user chips removed (PC-422).",
      },
      {
        type: "added",
        description:
          "Admin Enable Poll (default on); Poll is hidden on new event drafts when off (PC-423).",
      },
      {
        type: "added",
        description:
          "Just Proposals vs Proposals and Schedule; Schedule skips approval votes, uses Add to calendar, and auto-resolves (PC-424).",
      },
      {
        type: "added",
        description:
          "Proxy Scheduling with Schedule on behalf of when dual posting is on (PC-425). SCHEMA_VERSION 49.",
      },
    ],
  },
  {
    version: "2026.08.03a",
    date: "2026-08-03",
    summary:
      "Keep-alive tab swipe, Admin MOTD All Platform, calendar archive policy (PC-403–PC-408).",
    changes: [
      {
        type: "fixed",
        description:
          "Hardened poll-optional-decline and residency-proposal E2E waits (PC-404).",
      },
      {
        type: "changed",
        description:
          "Auto-archive no longer deletes Google/ICS copies; cancel/hard-delete still sync-delete with ICS manual-delete notice (PC-405).",
      },
      {
        type: "added",
        description:
          "Admin MOTD All Platform toggle for platform admins (PC-406).",
      },
      {
        type: "added",
        description:
          "Keep-alive MainTabCarousel with swipe + tab swipe keepalive journeys (PC-407, PC-408).",
      },
    ],
  },
  {
    version: "2026.08.02c",
    date: "2026-08-02",
    summary:
      "Post-schema cleanup, schedule/feed UX polish, Google sync failure CTA (PC-395–PC-402).",
    changes: [
      {
        type: "changed",
        description:
          "Network-aware admin gates; retired poly_group app shims (table retained); hot-path settings memo + batch writes (PC-396, PC-397).",
      },
      {
        type: "added",
        description:
          "Google Calendar sync failure dialog and inbox CTA to /profile#calendar-integration (PC-398).",
      },
      {
        type: "fixed",
        description:
          "Partner-only sleeping schedule taps show access-denied copy instead of “no longer available” (PC-399).",
      },
      {
        type: "changed",
        description: "Week and two-week views start with Today (PC-400).",
      },
      {
        type: "added",
        description: "Comment composer on Feed happening-now pins (PC-401).",
      },
      {
        type: "fixed",
        description: "Centered karaoke mic and tightened beer glyph geometry (PC-402).",
      },
    ],
  },
  {
    version: "2026.08.01c",
    date: "2026-08-01",
    summary: "Schema refactor phase 3: modularize Drizzle schema by domain.",
    changes: [
      {
        type: "changed",
        description:
          "Split monolithic schema.ts into domain modules under src/lib/db/schema/ (identity, networks, proposals, feed, calendar, etc.).",
      },
      {
        type: "changed",
        description:
          "schema.ts is now a thin re-export shim; existing @/lib/db/schema imports unchanged.",
      },
    ],
  },
  {
    version: "2026.08.01b",
    date: "2026-08-01",
    summary:
      "Schema refactor phase 2: network-aware admin authorization; sync users.role from memberships.",
    changes: [
      {
        type: "changed",
        description:
          "Admin access gates use active network role and platform admin flag instead of legacy users.role alone.",
      },
      {
        type: "changed",
        description:
          "users.role is kept as a denormalized cache synced from network membership on upsert (syncDenormalizedUserRole).",
      },
      {
        type: "changed",
        description:
          "Removed legacy isActiveNetworkAdmin fallback to users.role === admin; impersonation JWT checks network_admin.",
      },
    ],
  },
  {
    version: "2026.08.01a",
    date: "2026-08-01",
    summary:
      "Schema refactor phase 1: retire poly_group app reads; rename Poly Group to Network.",
    changes: [
      {
        type: "changed",
        description:
          "All settings reads and writes route through the networks table; poly_group dual-write removed from admin settings save.",
      },
      {
        type: "changed",
        description:
          "Admin UI and API surface renamed from Poly Group to Network (settings panel, display name, seeds).",
      },
      {
        type: "changed",
        description:
          "Seeds insert networks rows directly; deprecated shims remain at poly-group.ts for transitional imports.",
      },
    ],
  },
  {
    version: "2026.07.29a",
    date: "2026-07-29",
    summary:
      "MOTD pop-ups, Admin under header menu, multi-color event icons.",
    changes: [
      {
        type: "added",
        description:
          "Message of the Day: platform and network scoped pop-ups (max 255 chars, optional end time, dismiss-once acknowledgment with inbox archive, soft poll delivery) (PC-392).",
      },
      {
        type: "changed",
        description:
          "Admin removed from bottom tabs; opened from the profile menu under Platform admin. Duplicate Platform panel removed from /admin (PC-393).",
      },
      {
        type: "changed",
        description:
          "Event category icons use multi-color Garden Brutalism fills with richer paths; watermark placement/opacity unchanged (PC-394).",
      },
    ],
  },
  {
    version: "2026.07.28b",
    date: "2026-07-28",
    summary:
      "FastSleep Proposal cleanup: multi-slot nights, notes, renames, and Feed admin toggle.",
    changes: [
      {
        type: "added",
        description:
          "FastSleep Proposal grid supports multiple slots on the same night (e.g. two solos), per-slot notes, and Proposer label (PC-383).",
      },
      {
        type: "changed",
        description:
          "UI renames: FastSleep → FastSleep Proposal; Place residency proposal → Residency Proposal; admin Enable FastSleep Proposal (PC-384).",
      },
      {
        type: "added",
        description:
          "Admin Enable Feed toggle (default ON) hides Feed nav, redirects /feed, and rejects feed actions when off; SCHEMA_VERSION 46 (PC-385).",
      },
    ],
  },
  {
    version: "2026.07.28a",
    date: "2026-07-28",
    summary:
      "FastSleep proposal type: partner-arrangement auto-confirm, admin toggle, feed/calendar wiring.",
    changes: [
      {
        type: "added",
        description:
          "New proposalType fast_sleep with 14-night Fast Sleeping Plan grid, rule-B authority (self + partner arrangements), auto-resolve, and one Auto-confirmed feed milestone (PC-378/PC-379/PC-380).",
      },
      {
        type: "added",
        description:
          "Admin Poly group setting Enable FastSleep (default ON) gates UI and create action (PC-378).",
      },
      {
        type: "changed",
        description:
          "Calendar/ICS and schedule treat FastSleep like batch sleeping; per-night subject counts as on-night for sync (PC-379).",
      },
      {
        type: "changed",
        description:
          "SCHEMA_VERSION 45 applies fast_sleep_enabled on networks/poly_group so existing DBs pick up the FastSleep admin toggle column (PC-378).",
      },
      {
        type: "fixed",
        description:
          "FastSleep Auto-confirmed feed milestones remain visible to proposers and invitees even when network audit visibility is admin-only (PC-378).",
      },
    ],
  },
  {
    version: "2026.07.27f",
    date: "2026-07-27",
    summary:
      "Sleeping as all-day events, optional partners, NYT default, draft redraft save fix.",
    changes: [
      {
        type: "changed",
        description:
          "Sleeping arrangements render in the all-day strip as non-time day events (no 0–8am hour-grid band) (PC-372).",
      },
      {
        type: "fixed",
        description:
          "Cancelled sleeping (including batch) no longer leaves schedule/slot ghosts that false-conflict on resubmit; place conflicts remain sleeping-only (PC-373).",
      },
      {
        type: "changed",
        description:
          "Sleeping partners default to optional in batch/fast-plan; Required remains available (PC-374).",
      },
      {
        type: "fixed",
        description:
          "Admins can save redrafted drafts (updateDraft matches canEdit); clearer Draft not found gates (PC-375).",
      },
      {
        type: "changed",
        description:
          "Accounts default to America/New_York (schema/backfill/creator); proposal times format in account TZ; day-view hour labels use account TZ (PC-376). SCHEMA_VERSION 44.",
      },
    ],
  },
  {
    version: "2026.07.27e",
    date: "2026-07-27",
    summary:
      "Platform admins can elevate users; All Users shows access level and avatars.",
    changes: [
      {
        type: "added",
        description:
          "Platform admins can grant or revoke Platform Admin / Admin / User access from Admin → User management and Platform Admin → All Users (PC-369 / PC-370).",
      },
      {
        type: "changed",
        description:
          "Platform Admin All Users shows each user's avatar and access level label; access changes are available on every user block (PC-370).",
      },
    ],
  },
  {
    version: "2026.07.27d",
    date: "2026-07-27",
    summary:
      "Sleeping day layout, admin milestone delete, partner sleeping toggle, calendar LOCATION/DESCRIPTION.",
    changes: [
      {
        type: "changed",
        description:
          "Week/agenda/day-sheet list sleeping last; day hour grid places sleeping in the 0–8am band instead of the all-day strip (PC-364).",
      },
      {
        type: "added",
        description:
          "Admins can soft-delete feed milestones (proposal_state_log.deleted_at); SCHEMA_VERSION 43 (PC-365).",
      },
      {
        type: "added",
        description:
          "Network toggle See partners' sleeping arrangements (lighter purple partner-only nights) (PC-366).",
      },
      {
        type: "fixed",
        description:
          "Calendar sync resolves locationId place names and includes description/notes (batch comment preferred) (PC-367).",
      },
    ],
  },
  {
    version: "2026.07.27c",
    date: "2026-07-27",
    summary: "Feed cleanup, calendar today highlight, platform admin readability.",
    changes: [
      {
        type: "changed",
        description:
          "Removed Code Status from Feed; platform admin and network detail use stacked card rows instead of cramped tables; week/two-week/month today cells use light blue background; DevBar impersonation dropdown removed (Admin → Test data remains).",
      },
    ],
  },
  {
    version: "2026.07.27b",
    date: "2026-07-27",
    summary: "Fix test login after moderation columns missed migration.",
    changes: [
      {
        type: "fixed",
        description:
          "SCHEMA_VERSION 42 re-applies admin migrations so moderation columns exist on Turso DBs that already stored v41 before the platform moderation UI shipped; restores sign-in (PC-362).",
      },
    ],
  },
  {
    version: "2026.07.27a",
    date: "2026-07-27",
    summary:
      "Platform admin console, user moderation, sleeping optional invitees, schedule title cleanup.",
    changes: [
      {
        type: "added",
        description:
          "Expanded /platform-admin: network detail reports, inhabit admin, global user pause/ban/delete with reason and optional duration; paused/banned login screens; SCHEMA_VERSION 41 moderation columns (PC-362).",
      },
      {
        type: "changed",
        description:
          "Sleeping proposals may submit with optional-only invitees; resolved schedule blocks omit Confirmed (PC-351 follow-up).",
      },
      {
        type: "fixed",
        description: "E2E navigation strict-mode flake on Rebel Alliance header (PC-362).",
      },
    ],
  },
  {
    version: "2026.07.26d",
    date: "2026-07-26",
    summary:
      "Canonical platform admin grant for mpburton / mpburton@gmail.com.",
    changes: [
      {
        type: "changed",
        description:
          "Platform operator identities helper; one-time migration matches username or notification email; seeds and prod bootstrap aligned; SCHEMA_VERSION 41 (PC-362).",
      },
    ],
  },
  {
    version: "2026.07.26c",
    date: "2026-07-26",
    summary:
      "Platform admin dashboard on Admin tab with network node stats and operator controls.",
    changes: [
      {
        type: "added",
        description:
          "Platform operators see a Platform section on Admin with aggregate counts, per-network node table (ID, status, members, creator), creation caps, pause/activate, and control reference (PC-365).",
      },
    ],
  },
  {
    version: "2026.07.26b",
    date: "2026-07-26",
    summary:
      "Network data isolation across feed, schedule, proposals, partnerships, and admin settings.",
    changes: [
      {
        type: "fixed",
        description:
          "Tenant-scoped reads and writes for proposals, feed milestones/chat, sleeping partnerships, schedule, and per-network admin settings so separate networks only share users who belong to both (PC-364).",
      },
      {
        type: "fixed",
        description:
          "Network setup wizard shows signed-in email mismatch with sign-out path; JWT network switches validate membership (PC-364).",
      },
    ],
  },
  {
    version: "2026.07.26a",
    date: "2026-07-26",
    summary:
      "Network setup picks existing or new first admin; network dashboard in Admin; mpburton platform admin.",
    changes: [
      {
        type: "added",
        description:
          "Self-serve setup wizard lets unsigned creators sign in with an existing username (email must match the magic link) or create a new account as the first network_admin; signed-in users skip the account step (PC-363).",
      },
      {
        type: "added",
        description:
          "Admin tab shows an active-network dashboard for network admins and platform controls for platform operators; mpburton is granted is_platform_admin via migration (PC-363).",
      },
    ],
  },
  {
    version: "2026.07.25e",
    date: "2026-07-25",
    summary:
      "Multi-network tenancy: one login, many networks, switcher, self-serve create, platform admin.",
    changes: [
      {
        type: "added",
        description:
          "Shared-DB row multi-tenancy with `networks`, `network_members`, `platform_settings`, and `networkId` backfill; JWT `activeNetworkId` with header switcher; magic-link `/create-network` and `/setup-network`; optional import of residences and sleeping partners on join; platform admin at `/platform-admin` (pause networks, edit caps, scoped remove vs ban). SCHEMA_VERSION 39→40 (PC-357).",
      },
      {
        type: "fixed",
        description:
          "E2E DB reset wipes and rebackfills networks; sleeping partnership uniqueness scoped by `networkId`; places and admin delete after tenant reset; notification inbox refresh deferred so Close is not detached (PC-357).",
      },
    ],
  },
  {
    version: "2026.07.25d",
    date: "2026-07-25",
    summary:
      "ActionResult message normalization, shared actionFail helper, ESLint in CI, changelog archive.",
    changes: [
      {
        type: "changed",
        description:
          "Normalize ActionResult to `{ message }` with shared `actionFail`; add `npm run lint` to dev/test/production CI workflows; share `proposalCard` e2e locator; archive older changelog entries (PC-356).",
      },
    ],
  },
  {
    version: "2026.07.25c",
    date: "2026-07-25",
    summary:
      "Phase 2 DB indexes, bounded scans, calendar sync concurrency, avatar cache headers.",
    changes: [
      {
        type: "changed",
        description:
          "SCHEMA_VERSION 38 secondary indexes; PRAGMA foreign_keys=ON; bound conflict/enforcement/board/schedule/notification scans; calendar sync concurrency; avatar Cache-Control/ETag; MUI optimizePackageImports (PC-355).",
      },
    ],
  },
  {
    version: "2026.07.25b",
    date: "2026-07-25",
    summary:
      "Public Terms, self-service account delete/export, PWA maskable icon and offline fallback.",
    changes: [
      {
        type: "added",
        description:
          "Public `/terms`, self-service account delete with full purge, download-my-data export; privacy §8 retention rewrite; PWA maskable icon and offline navigation fallback (PC-354).",
      },
    ],
  },
  {
    version: "2026.07.25a",
    date: "2026-07-25",
    summary:
      "Phase 0 security hardenings: hashed tokens, paused-account gate, fail-closed e2e, image validation.",
    changes: [
      {
        type: "fixed",
        description:
          "Hash password-reset and email-verify tokens at rest (SHA-256); timing-safe secret compares for cron, e2e, and impersonation; block paused accounts in `requireSession`; fail-closed e2e gates (refuse `polycal-prod`); prod impersonation gated; magic-byte validation for feed/feedback images; push endpoint ownership; JWT never skips pause/sessionVersion refresh (PC-353).",
      },
    ],
  },
  {
    version: "2026.07.24e",
    date: "2026-07-24",
    summary:
      "Batch sleeping syncs one all-day free Google/ICS night each; drop Confirmed from resolved titles.",
    changes: [
      {
        type: "changed",
        description:
          "Batch sleeping exports one all-day free external calendar event per night (per-night LOCATION + title keeps `, at Location`); non-batch multi-day sleeping stays one span; resolved/archived sleeping titles omit Confirmed; SCHEMA_VERSION 37 adds calendar_event_links.night_key (PC-351).",
      },
    ],
  },
  {
    version: "2026.07.24d",
    date: "2026-07-24",
    summary:
      "Rebalance Playwright CI shards by suite (serial×3 + safe×2) to cut wall-clock skew.",
    changes: [
      {
        type: "changed",
        description:
          "E2E and production workflows shard chromium-serial and chromium-safe independently (3 + 2 jobs) instead of flat --shard=N/5, which packed SERIAL_ONLY into early jobs; lean server topology per suite (PC-350).",
      },
    ],
  },
  {
    version: "2026.07.24c",
    date: "2026-07-24",
    summary:
      "Onboarding returns to Calendar after Google OAuth; inbox Open Proposal + prune stale rows on bell open.",
    changes: [
      {
        type: "fixed",
        description:
          "Google Calendar connect during first-login restores the Calendar wizard step (query + sessionStorage) instead of resetting near Sleeping partners (PC-348).",
      },
      {
        type: "added",
        description:
          "Sleeping-partner inbox rows include Open Proposal (People & Places deep-link); proposal/residency Open Notification renamed to Open Proposal (PC-349).",
      },
      {
        type: "fixed",
        description:
          "Opening the notification bell reconciles/dismisses actionable rows that are no longer actionable; accepting a partnership outside the inbox dismisses matching partnership_proposed rows (PC-349).",
      },
    ],
  },
  {
    version: "2026.07.24b",
    date: "2026-07-24",
    summary:
      "Google Calendar sync confirmations in the inbox, awaited admin Fast sleeping push, and Retry calendar sync recovery.",
    changes: [
      {
        type: "added",
        description:
          "Inbox notifications when Google Calendar add/update/remove succeeds, or when sync fails (no calendar selected, needs reconnect, API error) (PC-346).",
      },
      {
        type: "fixed",
        description:
          "Admin Fast sleeping force-resolve awaits calendar sync so Google push does not rely solely on after(); OAuth connect auto-selects the primary calendar when none is saved yet; proposer is notified when no participant has a calendar connection (root cause of the production Fast-add miss) (PC-347).",
      },
      {
        type: "added",
        description:
          "Resolved proposal detail includes Retry calendar sync for recovery after reconnect; docs cover one-sided Google participants and batch all-day free blocks (PC-347).",
      },
    ],
  },
  {
    version: "2026.07.24a",
    date: "2026-07-24",
    summary:
      "Fix hard-delete of proposals blocked by calendar/residency/recurrence foreign keys.",
    changes: [
      {
        type: "fixed",
        description:
          "Draft and admin delete now clear calendar_event_links, calendar_ics_pending, location_residents.proposal_id, and child parent_proposal_id before removing the proposal row (PC-346).",
      },
    ],
  },
  {
    version: "2026.07.23c",
    date: "2026-07-23",
    summary:
      "Surface Download ICS on resolved proposal cards, detail dialog, and notification inbox (stays available after first download).",
    changes: [
      {
        type: "added",
        description:
          "Resolved kanban cards and proposal detail show Download ICS when the viewer has a queued .ics for that proposal; inbox calendar_ics_pending rows include a Download ICS button; button remains after the first download (PC-345).",
      },

      {
        type: "changed",
        description:
          "ICS ready notification copy is now “You have a calendar ics available for the event : [name].” and deep-links to the proposal (PC-345).",
      },
      {
        type: "fixed",
        description:
          "Solo auto-resolve on submit now runs collision decline + scheduleCalendarSync (previously only special/residency proposals called resolveProposal, so Google/ICS never queued for intentional-solo events) (PC-345).",
      },
    ],
  },
  {
    version: "2026.07.23b",
    date: "2026-07-23",
    summary:
      "Fix external calendar sync on Vercel: keep the serverless invocation alive until Google/ICS work finishes after resolve.",
    changes: [
      {
        type: "fixed",
        description:
          "scheduleCalendarSync now uses Next.js after() (Vercel waitUntil) instead of bare void Promise; fire-and-forget sync was being frozen when the resolve response returned, so solo resolved events never reached Google Calendar or ICS pending downloads (PC-337).",
      },
    ],
  },
  {
    version: "2026.07.23a",
    date: "2026-07-23",
    summary:
      "External calendar integration (Option B): Google OAuth sync into an existing calendar, iCal/Other .ics download/email/both, onboarding + Profile settings.",
    changes: [
      {
        type: "added",
        description:
          "SCHEMA_VERSION 36: calendar_connections, calendar_event_links, calendar_ics_pending; Google Calendar OAuth connect (not login) with encrypted refresh tokens; sync on resolve/reschedule/cancel for all configured invitees; sleeping exports as all-day free/transparent with the PolyCal sleeping title; iCal Download/Email/Both with pending download + notification when email is unavailable; Profile and onboarding Calendar step (PC-337–PC-342).",
      },
    ],
  },
  {
    version: "2026.07.22j",
    date: "2026-07-22",
    summary:
      "Epic 6 auth/prefs polish: unify admin server actions on requireAdminAccess, drop the onboarding SMS channel UI, correct the quiet-hours copy, and make the feed update-token a cheap fingerprint query.",
    changes: [
      {
        type: "changed",
        description:
          "Admin server actions now route through the shared requireAdminAccess helper instead of duplicating raw role===\"admin\" / local requireAdmin(session) checks: admin.ts (resetTestDatabase, logForceReload, listActivityLog, exportActivityLog), poly-group.ts (get/updatePolyGroupSettings), and users.ts (updateUser, deleteUser, listAdminUsers, pause/resumeUser, adminResetPassword). Access semantics are identical (userHasAdminAccess === role \"admin\"); provisioning paths that intentionally allow non-admins are unchanged (PC-335).",
      },
      {
        type: "changed",
        description:
          "Removed the dead \"SMS (coming in a later release)\" channel checkbox from the first-login onboarding wizard; email and in-app/push preference paths are unchanged. The SMS backend field is left in place (no longer surfaced in onboarding UI) (PC-335).",
      },
      {
        type: "fixed",
        description:
          "Corrected the Profile quiet-hours help text, which wrongly claimed email \"still delivers\" during quiet hours — email is in fact suppressed alongside in-app and push (urgent alerts still come through), matching shouldSuppressEmailDelivery (PC-335).",
      },
      {
        type: "changed",
        description:
          "getFeedUpdateTokenAction no longer loads and hydrates the full first page to build a token; it now computes a cheap COUNT/MAX fingerprint (milestones, chat messages/comments, proposal comments, likes + viewer likes, proposal edits, and the current active-event set). listFeedItemsAction returns the same fingerprint so the client baselines silent polls without an extra round-trip (PC-336).",
      },
    ],
  },
  {
    version: "2026.07.22i",
    date: "2026-07-22",
    summary:
      "Epic 5 schema hygiene: stop ensuring long-dead poly_group/hour columns, guard legacy backfills for fresh DBs, and bump SCHEMA_VERSION to 35 (behavior-preserving).",
    changes: [
      {
        type: "changed",
        description:
          "admin-migrations no longer ensures the retired poly_group columns (allow_group_name_proposals, group_name_change_mode, power_management_mode, role_snapshots_json, event_privacy_open/private/super_private, admin_can_see_private/super_private, sleeping_network_visibility); proposals-migrations no longer ensures the legacy hour columns (recovery_max_hours, proposed_max_hours, at_risk_ttl_hours). Existing DBs keep the columns; fresh DBs simply omit them and the app no longer reads them (PC-332).",
      },
      {
        type: "changed",
        description:
          "pc280 cleanup and the hours→days enforcement backfill now check column presence (PRAGMA table_info) before their UPDATEs, so fresh DBs without the retired/legacy columns no longer crash; the pc280_cleanup_v1 and enforcement_hours_to_days_v1 flags are still set so migrations never retry (PC-332).",
      },
      {
        type: "changed",
        description:
          "Removed the retired poly_group fields from the Drizzle schema and bumped SCHEMA_VERSION 34→35 (with verify-turso-schema EXPECTED_SCHEMA_VERSION synced) (PC-333).",
      },
    ],
  },
  {
    version: "2026.07.22h",
    date: "2026-07-22",
    summary:
      "Epic 4 proposals core carve: conflict/resolution engine and lifecycle/comment actions split out of the _core god-module (behavior-preserving).",
    changes: [
      {
        type: "changed",
        description:
          "Conflict detection + on-resolve collision handling moved into src/lib/proposals/services/conflicts.ts (proposalConflictWindows, checkPlaceAssetConflicts, gatherProposalConflictWarnings, autoDeclineCollidingProposals); the _core check/admin-check/force-resolve actions stay as thin wrappers with identical widened-window (PC-59/PC-318) behavior (PC-328).",
      },
      {
        type: "changed",
        description:
          "Resolution engine (poll tallying, resolve/revert transitions, per-slot aggregate sync, sleeping title + schedule helpers) moved into src/lib/proposals/services/resolution.ts; APPROVING_VOTES/APPROVING_SLOT_VOTES now live in proposals/constants.ts. Poll-matrix rules, residency side-effects, and notify copy are byte-for-byte unchanged (PC-328).",
      },
      {
        type: "changed",
        description:
          "Resolved-proposal lifecycle actions (attendees, respond, revoke, reschedule, cancel, redraft, nudge) moved into src/actions/proposals/lifecycle.ts and comment actions into src/actions/proposals/comments.ts; @/actions/proposals and the drafts/voting/resolve/read facades re-export them so the public server-action API is unchanged. _core.ts shrank ~1840 lines and dead partner-alias wrappers were removed in favor of importing @/lib/proposals/partners directly (PC-329/PC-330).",
      },
    ],
  },
  {
    version: "2026.07.22g",
    date: "2026-07-22",
    summary:
      "Playwright journeys for poll required/optional approve paths and midnight/11pm self-appointment day boundaries.",
    changes: [
      {
        type: "added",
        description:
          "Poll journey: 3 slots, 2 required + 1 optional; one required opens via notification, the other via Proposed; optional declines with a note visible to the proposer (PC-325).",
      },
      {
        type: "added",
        description:
          "Self-appointment day-boundary journey: 1h/2d at 12am and 11pm, one-shot and weekly×3, confirming calendar placement three days out (PC-326).",
      },
    ],
  },
  {
    version: "2026.07.22f",
    date: "2026-07-22",
    summary:
      "Proposal state-transition + notification consolidation: one logProposalTransition writer, shared notifyProposalParticipants fan-out, typed action→feed-kind catalog.",
    changes: [
      {
        type: "changed",
        description:
          "Single logProposalTransition (state-log) now accepts transaction executors and is the only writer of proposal_state_log rows — the duplicate slices logger and the enforcement/pending-recovery logSystemTransition helpers were removed and rewired through it (PC-321).",
      },
      {
        type: "changed",
        description:
          "New shared notifyProposalParticipants fan-out (loads invitees, unions the proposer, dedupes, applies shared metadata defaults) backs the proposer/invitee stakeholder notifications; the _core stakeholder helper, slices detach notice, resolve optional-RSVP copy, at-risk proposer-vs-invitee copy, and the redraft/auto-cancel/revert loops are now thin wrappers with identical copy and metadata (PC-322).",
      },
      {
        type: "changed",
        description:
          "FEED_* transition allowlists and contentKindForMilestoneAction moved into a typed transition-catalog beside state-log; feed/prefs-filter re-exports it so Feed behavior is unchanged (no new actions surface) (PC-323).",
      },
    ],
  },
  {
    version: "2026.07.22e",
    date: "2026-07-22",
    summary:
      "Date-only contract docs + conflict/calendar parity: sleeping midnight-TZ vs all-day noon-UTC, widened overlap windows.",
    changes: [
      {
        type: "changed",
        description:
          "Proposal conflict detection reuses the calendar's buildScheduleWindows and widens sleeping/all-day windows to whole civil days, so same-night sleeping (null end) and same-day all-day (noon/noon) collide while events never conflict with sleeping (PC-318 / PC-59).",
      },
      {
        type: "fixed",
        description:
          "Draft dialog sleeping/batch schedule preview now uses the sleeping midnight-in-TZ helper (was noon-UTC), matching the persisted value; stale all-day comment corrected and date-only contract documented (PC-317).",
      },
      {
        type: "changed",
        description:
          "Single intervalsOverlap sourced from schedule/dates (enforcement re-exports it); viewer timezone passed into all-day span expansion on slice detach paths (PC-318).",
      },
    ],
  },
  {
    version: "2026.07.22d",
    date: "2026-07-22",
    summary:
      "Visibility/partners SSOT: shared partner loaders, schedule Busy mask helper, honest admin calendar toggle.",
    changes: [
      {
        type: "changed",
        description:
          "Accepted sleeping partners and eligible locations load from one module used by schedule, slices, proposals, and fast-sleeping (PC-305).",
      },
      {
        type: "changed",
        description:
          "canViewProposalContent unifies sleeping visibility + optional calendar Busy mask; dead masked=false scaffolding removed from board/feed/detail (PC-306).",
      },
      {
        type: "changed",
        description:
          "Masked calendar copy is Busy everywhere; admin toggle label matches calendar-only masking for uninvolved admins (PC-307).",
      },
    ],
  },
  {
    version: "2026.07.22c",
    date: "2026-07-22",
    summary:
      "Single-day all-day calendar span fix, slice error admin log, batch Tentative title on resolve.",
    changes: [
      {
        type: "fixed",
        description:
          "Single-day all-day events no longer span two calendar days or fail open with Day not part of a multi-day span — noon civil bounds, sub-24h collapse, and viewer-TZ slice membership (PC-301).",
      },
      {
        type: "fixed",
        description:
          "Schedule slice detail/detach failures are written to the System administrator log as error events (PC-302).",
      },
      {
        type: "fixed",
        description:
          "Resolving sleeping/batch proposals refreshes the stored title from Tentative to Confirmed (PC-303).",
      },
    ],
  },
  {
    version: "2026.07.22b",
    date: "2026-07-22",
    summary:
      "Feed sticky Happening-now event pins; named actors on notifies and system log.",
    changes: [
      {
        type: "added",
        description:
          "Feed pins currently-happening non-sleeping (resolved) events in a sticky Happening now highlight stack above the timeline; silent poll tracks active window changes (PC-298).",
      },
      {
        type: "fixed",
        description:
          "Actor-authored notifications name the initiating user (no hardcoded \"An admin\" / \"an administrator\"); admin activity logs attribute notification.* rows to the actor while preserving the recipient in details (PC-299).",
      },
    ],
  },
  {
    version: "2026.07.21i",
    date: "2026-07-21",
    summary: "Ops script: production schedule/chat wipe keeping people and places.",
    changes: [
      {
        type: "added",
        description:
          "Operator-only script wipe-production-schedule-keep-people.ts clears proposals, schedule, pending partnerships/residencies, and Feed chat while keeping users, locations, and accepted ties — fail-closed to polycal-prod + CONFIRM_PROD_WIPE (PC-289).",
      },
    ],
  },
  {
    version: "2026.07.21h",
    date: "2026-07-21",
    summary: "Post-280 audit: TZ sleeping dates, security hardenings, perf, Playwright.",
    changes: [
      {
        type: "fixed",
        description:
          "Sleeping civil dates and day-end expiry/archive use the viewer's IANA timezone (default America/New_York) instead of the host process locale — fixes Vercel UTC midnight shifts (PC-282).",
      },
      {
        type: "changed",
        description:
          "Masked sleeping copy is now \"Busy\" / Hidden (not \"Private event\"). Feed image downloads require attachment membership; Credentials impersonation requires an existing admin JWT; rate limits persist in SCHEMA 33; production alpha-feedback CORS is allowlisted; CSP img-src allows https OG images (PC-282).",
      },
      {
        type: "changed",
        description:
          "Schedule overlap marking uses day buckets for large weeks; notification revalidation is scoped to shell tabs; People & Places loads via next/dynamic (PC-282).",
      },
    ],
  },
  {
    version: "2026.07.21g",
    date: "2026-07-21",
    summary: "UX cleanup batch: removals, privacy purge, polish, sleeping-past fixes.",
    changes: [
      {
        type: "changed",
        description:
          "Removed Planning drawer from Schedule, Clone proposal, group-name-change proposals, and admin power management (\"all admins\" toggle) — impersonation is unaffected. Sleeping proposal network visibility is now hard-defaulted to \"involved\" everywhere; the admin toggle is gone (PC-280).",
      },
      {
        type: "changed",
        description:
          "Private/super-private event privacy levels are removed entirely — every proposal (including events) is always open, admin privacy toggles are gone, and masking logic was simplified accordingly. SCHEMA_VERSION 32 backfills existing proposals to open and normalizes retired poly_group columns (PC-280).",
      },
      {
        type: "changed",
        description:
          "Removed descriptive tab blurbs from Feed, Schedule, Proposals, and People & Places, and Admin (Profile's \"Signed in as\" is unchanged). Draft Delete/Exit and proposal detail dialog footer actions now use the same pill outlined/contained button styling as Save/Submit. Feed composers default to 2 rows and Enter now inserts a newline instead of submitting (PC-280).",
      },
      {
        type: "fixed",
        description:
          "Sleeping proposals no longer show as \"past\" until the whole calendar day elapses (board and proposal cards), and the Schedule overlap/red-conflict check no longer flags a sleeping arrangement against an event on the same night, matching PC-59 parity (PC-280).",
      },
    ],
  },
  {
    version: "2026.07.21f",
    date: "2026-07-21",
    summary: "Feed URL embeds with Facebook-style link previews.",
    changes: [
      {
        type: "added",
        description:
          "Chat and comment bodies linkify http(s) URLs and attach Open Graph preview cards (cached, SSRF-hardened unfurl). Composer shows a debounced preview (PC-279). SCHEMA_VERSION 31.",
      },
    ],
  },
  {
    version: "2026.07.21e",
    date: "2026-07-21",
    summary:
      "Optional invitees stay visible after required attendees resolve (extend PC-49).",
    changes: [
      {
        type: "added",
        description:
          "Unfinished optional invitees keep Proposed-board visibility, a detail Alert, and an actionable resolve notification until they RSVP; optional still does not block schedule resolution (PC-278).",
      },
    ],
  },
  {
    version: "2026.07.21d",
    date: "2026-07-21",
    summary: "Feed like bird enlarged to 36×36 (3× prior size).",
    changes: [
      {
        type: "changed",
        description:
          "Feed window like (upvote) parrot set to 36×36 — three times the prior 12×12 size — for easier tapping (PC-277). Bottom nav parrot stays 24×24.",
      },
    ],
  },
  {
    version: "2026.07.21c",
    date: "2026-07-21",
    summary:
      "Proposal enforcement in days, admin visibility fixes, icon watermarks, CI Node 24.",
    changes: [
      {
        type: "changed",
        description:
          "Max proposed / at-risk TTL use days; sleeping-partner proposals auto-delete after configurable days (default 5) with notifications; missing-invitee recovery removed (PC-273).",
      },
      {
        type: "fixed",
        description:
          "Admins can delete any draft; Delete/Continue gated by ownership; peach oversight only when uninvolved; toggle for admins seeing uninvolved proposals (PC-274).",
      },
      {
        type: "changed",
        description:
          "Higher-detail event icons as right-aligned 30% opacity kanban watermarks (PC-275). GitHub Actions checkout/setup-node/artifact bumped to @v5 (PC-276). SCHEMA_VERSION 30.",
      },
    ],
  },
  {
    version: "2026.07.21-prod",
    date: "2026-07-21",
    summary:
      "Production: Feed Controls, six-item UX batch, nav/like parrot sizing, audit patches.",
    changes: [
      {
        type: "added",
        description:
          "Feed Controls — Settings cog with presets and Detailed Tweaking (Who/What); prefs persist on the account; server-side list filter; vote milestones when Votes content is enabled (PC-264–PC-268). SCHEMA_VERSION 29.",
      },
      {
        type: "fixed",
        description:
          "Month all-day bars no longer fragment in US timezones; feed image uploads tolerate up to 4MB with clear errors (PC-258–PC-259).",
      },
      {
        type: "changed",
        description:
          "Draft-return notifications revoke+replace with reason; Reschedule hidden for batch sleeping; conflict messages list each overlap (PC-261–PC-263).",
      },
      {
        type: "changed",
        description:
          "Bottom FEED parrot matches sibling nav icons (24×24); feed like birds are half that (12×12) via shared constants (PC-270). Supersedes interim 36×36 nav / 40×40 like sizes from PC-260 / PC-269.",
      },
      {
        type: "fixed",
        description:
          "Dependency audit: brace-expansion and js-yaml patched (PC-258).",
      },
    ],
  },
  {
    version: "2026.07.21b",
    date: "2026-07-21",
    summary:
      "Feed nav parrot matches sibling tab icons; like birds are half that size.",
    changes: [
      {
        type: "changed",
        description:
          "Bottom FEED parrot restored to 24×24 (same as other nav icons); feed like birds set to 12×12 (half) via shared constants (PC-270).",
      },
    ],
  },
  {
    version: "2026.07.21",
    date: "2026-07-21",
    summary:
      "Feed Controls (presets + Detailed Tweaking), votes milestones, larger like bird.",
    changes: [
      {
        type: "added",
        description:
          "Feed Settings cog with presets and collapsed Detailed Tweaking (Who/What filters); prefs persist on the account (PC-264–PC-268). SCHEMA_VERSION 29.",
      },
      {
        type: "added",
        description:
          "Vote milestones (accept/decline/poll) appear in the feed when Votes content is enabled (PC-267).",
      },
      {
        type: "changed",
        description: "Feed like bird enlarged to 40×40 for visibility (PC-269).",
      },
    ],
  },
  {
    version: "2026.07.20",
    date: "2026-07-20",
    summary:
      "Month all-day bars, feed image uploads, Feed parrot, draft-return notifs, batch Reschedule, conflict lists.",
    changes: [
      {
        type: "fixed",
        description:
          "Multi-day all-day month bars merge virtual day slices and use TZ-safe noon bounds so US timezones no longer show overlapping 2-day fragments (PC-258).",
      },
      {
        type: "fixed",
        description:
          "Feed image Server Action body limit raised to 4MB with try/catch and client size precheck (PC-259).",
      },
      {
        type: "changed",
        description:
          "Feed bottom-nav icon is the parrot asset at 36×36 (1.5×) (PC-260).",
      },
      {
        type: "changed",
        description:
          "Returning a proposal to drafts dismisses prior proposal notifications and sends one informational notice with reason (PC-261).",
      },
      {
        type: "changed",
        description:
          "Reschedule is hidden for batch sleeping proposals (PC-262).",
      },
      {
        type: "changed",
        description:
          "Conflict check/submit messages list each overlapping person/place and title (PC-263).",
      },
    ],
  },
  {
    version: "2026.07.17",
    date: "2026-07-17",
    summary: "Feed Code Status starts minimized and expands via chevron.",
    changes: [
      {
        type: "changed",
        description:
          "Feed Code Status is collapsed by default and flies open when the chevron/header is clicked (PC-257).",
      },
    ],
  },
  {
    version: "2026.07.16d",
    date: "2026-07-16",
    summary:
      "Feed text wrap, Code Status for everyone, expanded proxy voting, Passive→Proxy labels.",
    changes: [
      {
        type: "fixed",
        description:
          "Feed chat and comment bodies wrap unbroken long strings so cards no longer overflow (PC-253).",
      },
      {
        type: "added",
        description:
          "Code Status panel on Feed for all users; Check for Update skips admin force-reload audit for non-admins (PC-254).",
      },
      {
        type: "changed",
        description:
          "Proxy-profile votes may be cast by the proposer or an accepted sleeping partner of that proxy (admins unchanged) (PC-255).",
      },
      {
        type: "changed",
        description:
          "User-facing role label Passive renamed to Proxy; DB role value remains passive (PC-256).",
      },
      {
        type: "fixed",
        description:
          "Remaining admin TextFields use HTML maxLength so over-length entry is blocked, not truncated in app code (PC-252).",
      },
    ],
  },
  {
    version: "2026.07.16c",
    date: "2026-07-16",
    summary: "Yellow highlight for feed comments only visible to admins.",
    changes: [
      {
        type: "added",
        description:
          "Feed proposal comments visible only because the viewer is an admin (e.g. sleeping arrangements under involved-only visibility) use a yellow background (PC-250).",
      },
    ],
  },
  {
    version: "2026.07.16b",
    date: "2026-07-16",
    summary:
      "Character limits, human logs, passive proxy votes, comment images, privacy & feedback FAB.",
    changes: [
      {
        type: "changed",
        description:
          "Location and About Me capped at 256 characters; other free-text fields at 1024 with HTML maxLength and clearer errors (PC-244).",
      },
      {
        type: "fixed",
        description:
          "Activity and proposal logs never show raw JSON; notification types use readable labels (PC-245).",
      },
      {
        type: "changed",
        description:
          "Passive invitees no longer auto-accept; the person who added them votes on their behalf (PC-246). SCHEMA_VERSION 28.",
      },
      {
        type: "fixed",
        description:
          "Feed comment images show immediate previews, optimistic posts, and retry on load failure (PC-247).",
      },
      {
        type: "changed",
        description:
          "Event Privacy control hidden on drafts when only Open is enabled site-wide (PC-248).",
      },
      {
        type: "fixed",
        description:
          "Feedback FAB raised ~50px and above dialogs so Issue Submit works over cards (PC-249).",
      },
    ],
  },
  {
    version: "2026.07.16a",
    date: "2026-07-16",
    summary: "Feed likes, silent poll, and schedule all-day redraft fix.",
    changes: [
      {
        type: "added",
        description:
          "Grey/green parrot likes under milestones, chats, and comments; likers popup (PC-239–PC-242).",
      },
      {
        type: "fixed",
        description:
          "Feed polls via head fingerprint and leaves the timeline alone when unchanged (no 15s spinner flash) (PC-239).",
      },
      {
        type: "fixed",
        description:
          "Same-day all-day redraft keeps end=start so moved events stay on the calendar (PC-239).",
      },
      {
        type: "changed",
        description:
          "E2E workflow skips feature-push runs when an open PR already covers the branch (PC-239).",
      },
    ],
  },
  {
    version: "2026.07.15d",
    date: "2026-07-15",
    summary: "Feed likes with parrot toggle and likers popup.",
    changes: [
      {
        type: "added",
        description:
          "Grey/green parrot likes under milestones, chats, and comments; count opens likers list (PC-239–PC-242).",
      },
      {
        type: "changed",
        description: "SCHEMA_VERSION 27 with feed_likes table (PC-240).",
      },
    ],
  },
  {
    version: "2026.07.15c",
    date: "2026-07-15",
    summary: "Unified Feed timeline with chat comments, images, and reply push.",
    changes: [
      {
        type: "changed",
        description:
          "Feed combines milestones and chat in one timeline (Option A styling, bottom composer); archived milestones excluded (PC-231–PC-233).",
      },
      {
        type: "added",
        description:
          "Chat comments with delete rules, multi-image messages/comments, lightbox thumbnails, and feed.chat_reply push to message author (PC-234–PC-237).",
      },
      {
        type: "added",
        description:
          "Milestone inline comments with proposer delete rule and SCHEMA_VERSION 26 feed tables (PC-235–PC-236).",
      },
    ],
  },
  {
    version: "2026.07.15b",
    date: "2026-07-15",
    summary: "Feed tab (milestones + network chat) and sleeping network visibility.",
    changes: [
      {
        type: "added",
        description:
          "Leftmost Feed tab with proposal lifecycle milestones, comments, and network-wide chat (PC-224–PC-228).",
      },
      {
        type: "added",
        description:
          "Admin sleepingNetworkVisibility (everyone vs involved) for sleeping proposals/arrangements, orthogonal to calendar hideSleepingArrangements (PC-229).",
      },
      {
        type: "changed",
        description:
          "Post-login and unmatched-path defaults land on /feed; SCHEMA_VERSION 25 with network_chat_messages (PC-225).",
      },
    ],
  },
  {
    version: "2026.07.15",
    date: "2026-07-15",
    summary: "Clear actionable proposal notifications when the invitee votes.",
    changes: [
      {
        type: "added",
        description:
          "Server soft-dismisses actionable inbox rows for a proposal after vote or attendee response (PC-217).",
      },
      {
        type: "changed",
        description:
          "Notification inbox syncs after refresh, adds Decline on vote rows, and clears all matching proposal rows locally (PC-218).",
      },
      {
        type: "added",
        description:
          "Unit + journey coverage that Accept/Decline (bell or Proposals UI) stay cleared after reload (PC-219).",
      },
    ],
  },
  ...CHANGELOG_ARCHIVE,
];

/** Most recent change control entry, or null when the log is empty. */
export function getLatestChangelogEntry(): ChangelogEntry | null {
  return CHANGELOG[0] ?? null;
}
