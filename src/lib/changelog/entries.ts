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
  {
    version: "2026.07.14d",
    date: "2026-07-14",
    summary: "Alpha Feedback Ready For Testing status and stable ticket IDs.",
    changes: [
      {
        type: "added",
        description:
          "Alpha Feedback status Ready For Testing in schema, API, and tracker UI (PC-221).",
      },
      {
        type: "added",
        description:
          "Stable human-visible ticket numbers (#N) with backfill; first column in tracker lists (PC-222).",
      },
    ],
  },
  {
    version: "2026.07.14c",
    date: "2026-07-14",
    summary: "Harden multi-server e2e isolation; journey speed tooling.",
    changes: [
      {
        type: "fixed",
        description:
          "Mobile e2e uses a dedicated DB/port; workers=1 no longer races SAFE with SERIAL on w0 (PC-213).",
      },
      {
        type: "added",
        description:
          "E2E_REUSE_SERVER opt-in, cleanup + journeys scripts, parallel prepare, testManualDb (PC-214).",
      },
      {
        type: "changed",
        description:
          "Playwright webServer wrap labels unexpected Next process exits (PC-214).",
      },
    ],
  },
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
