# Changelog

All notable changes to PolyCal are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026.08.25b] - 2026-08-25

### Added

- PC-481–PC-485: Production CI publishes signed PolyCal Android GitHub Releases (`android-v*` / `PolyCal-{version}.apk`). TWA prompts for APK updates with changelog. Profile documents Android system notifications via Web Push delegation. Change control: `2026.08.25b`.

## [2026.08.25a] - 2026-08-25

### Added

- PC-475–PC-480: Android Trusted Web Activity (`app.polycal`) with a home-screen NLP bar that opens New Event (NLP Input) inside the TWA. `/feed?compose=` deep-links, login callback query, Digital Asset Links, PWA shortcuts. Apple PWA unchanged. Play listing deferred. Bubblewrap stays a global CLI (`npm run twa:ensure`) so `npm audit` stays clean. Change control: `2026.08.25a`.

## [2026.08.24a] - 2026-08-24

### Fixed

- PC-474: After creating a multi-day event, 2-week and month schedule no longer apply the SSR current-week payload over a wider client fetch (overlapping events no longer vanish until reload). Composer submit invalidates the visible schedule range. Change control: `2026.08.24a`.

## [2026.08.20a] - 2026-08-20

### Added

- PC-459–PC-466: Sponsor role, autosave Network Configuration, 24h pending-delete then hard-wipe, Platform System Log + operator alerts, About/support message, email magic-link login (no password change), and app icons from `assets/images/icon.webp`. SCHEMA_VERSION 52. Change control: `2026.08.20a`.

## [2026.08.19e] - 2026-08-19

### Changed

- PC-448: Agent harness — `gh pr create` (no ManagePullRequest), Playwright Chromium install without apt `--with-deps`, 180s journey timeout, active-panel locators, production flake policy. Place-card `has` filters stay page-rooted so residency journeys find Add person. Batch-sleeping journey ignores the seeded Han+Leia Tatooine night. Change control: `2026.08.19e`.

## [2026.08.19d] - 2026-08-19

### Changed

- PC-452: Promotion PRs reuse the e2e.yml Next build instead of compiling twice. Playwright caches Chromium and installs the browser binary without apt `--with-deps` (that hang stalled serial shards for 25 minutes). Change control: `2026.08.19d`.

## [2026.08.19c] - 2026-08-19

### Changed

- PC-451: Proposal detail mutations patch local state instead of `router.refresh` unless the card moves columns. One shared ProposalDraftDialog on the sage create host. Change control: `2026.08.19c`.

## [2026.08.19b] - 2026-08-19

### Changed

- PC-450: SCHEMA_VERSION 51 network/feed covering indexes. Place residents and schedule slot scans are scoped to the active network. Change control: `2026.08.19b`.

## [2026.08.19a] - 2026-08-19

### Changed

- PC-448–PC-449: Sage create menu opens immediately. Composer people/places load in one bootstrap action. Place members batch in one query; Who-chip rank is viewer-scoped. Change control: `2026.08.19a`.

## [2026.08.18c] - 2026-08-18

### Changed

- PC-443–PC-447: New Event chips stay sage-green; posting is Proposal or Booking (voted vs auto-accepted); Batch nights removed from New Event sleeping. Proposed detail: Cancel Event, Back to Draft, no Delete proposal or Reschedule. FAB hidden on Feed and People & Places. Admin Event Types adds Just Bookings (forces booking, disables Poll; partner/residency proposals remain). Change control: `2026.08.18c`.

## [2026.08.18b] - 2026-08-18

### Changed

- PC-438–PC-442: Split FAB New Event vs New Event (NLP Input). Manual Title-first disclosure (Who/Where after dates). NLP Description-first with Booking-for from a named sleeper, or toast when bookings are off. Sleeping parser covers host vs sleeper, alone, their place, and Fri–Sat weekend nights. Change control: `2026.08.18b`.

## [2026.08.18a] - 2026-08-18

### Changed

- PC-432–PC-437: New Event composer — NLP Description + chips, calendar tap/drag + Social time slider, Who chips, Where home buttons; Poll/Recurring in More options; Admin Network Summary & MOTD and Network Configuration regroup. Change control: `2026.08.18a`.

## [2026.07.09] - 2026-07-09

### Added

- Production promotion: Sprint A/B user journey E2E (impersonation, overlap/revoke, passive user, notification inbox).

### Changed

- Proposal at-risk services extraction (PC-98); action context adoption (PC-97).

### Fixed

- Assessment security remediation (avatar IDOR, API secrets, session invalidation on password change).

## [2026.08.17b] - 2026-08-17

### Added
- PC-426–PC-431: Proposals and Bookings — Booking language in admin/composer, New Event progressive disclosure, Booked attendees on resolved events, Post to Feed, SCHEMA_VERSION 50. Change control: `2026.08.17b`.

## [2026.08.17a] - 2026-08-17

### Added
- PC-417–PC-425: shared sage create FAB on every authenticated screen; Feedback in the profile menu; network-scoped place pickers; unset Window / With invitees fly-outs; composer header chrome stripped; admin Enable Poll, Just Proposals vs Proposals and Schedule, and Proxy Scheduling (SCHEMA_VERSION 49). Change control: `2026.08.17a`.

## [Unreleased]

### Changed
- Promote cleanup UX polish to production (PC-395–PC-402). Change control: `2026.08.02e`.
- Promote cleanup UX polish to test (PC-395–PC-402). Change control: `2026.08.02d`.
- Promote schema refactor phases 1–3 to production (2026.08.01a–c). Change control: `2026.08.02b`.
- Promote schema refactor phases 1–3 to test (2026.08.01a–c). Change control: `2026.08.02a`.
- Schema refactor phase 3: split Drizzle schema into domain modules under `src/lib/db/schema/`. Change control: `2026.08.01c`.
- Schema refactor phase 2: network-aware admin authorization; sync `users.role` from network memberships. Change control: `2026.08.01b`.
- Schema refactor phase 1: retire poly_group app reads; route settings through networks; rename Poly Group → Network in admin UI. Change control: `2026.08.01a`.

### Added
- PC-391–PC-394 MOTD (platform/network pop-ups), Admin under profile menu, multi-color event icons; SCHEMA_VERSION 47 (`motd_messages`, `motd_acknowledgments`). Change control: `2026.07.29a`.
- PC-383–PC-385 FastSleep Proposal cleanup: multi-slot same night, per-slot notes, Proposer label; Residency Proposal rename; Admin Enable Feed (default ON); SCHEMA_VERSION 46. Change control: `2026.07.28b`.
- PC-378 FastSleep proposal type (auto-confirm partner arrangements, admin toggle, feed/calendar); SCHEMA_VERSION 45 (`fast_sleep_enabled`). Change control: `2026.07.28a`.
- PC-362 (test): Expanded platform admin — network detail reports, inhabit admin, global user moderation with reason/duration, paused/banned screens. Change control: `2026.07.27a`.

### Changed
- PC-393: Admin is no longer a bottom tab; Platform dashboard only on `/platform-admin`. Change control: `2026.07.29a`.
- PC-362 (test): Removed Code Status from Feed; platform admin uses stacked card layout; today's calendar cells use light blue highlight; DevBar no longer shows impersonation dropdown (use Admin → Test data). Change control: `2026.07.27c`.
- PC-362 (test): Sleeping proposals allow optional-only invitees; schedule blocks omit Confirmed on approved events. Change control: `2026.07.27a`.
- PC-357: Multi-network tenancy — one login / many networks with header switcher; self-serve create via `/create-network` and `/setup-network`; optional import of residences and sleeping partners on join; platform admin (`/platform-admin`) for pause/caps/remove/ban. SCHEMA_VERSION 39→40. Change control: `2026.07.25e`.
- PC-354: Public `/terms`, self-service account delete with full purge, download-my-data export; PWA maskable icon and offline navigation fallback. Change control: `2026.07.25b`.

### Changed
- PC-362: Canonical platform admin grant for username `mpburton` and notification email `mpburton@gmail.com`; one-time migration, seeds, and prod bootstrap aligned; SCHEMA_VERSION 41. Change control: `2026.07.26d`.
- PC-356: Normalize ActionResult to `{ message }`; add `npm run lint` to dev/test/production CI; archive older changelog entries. Change control: `2026.07.25d`.
- PC-355: SCHEMA_VERSION 38 secondary indexes; PRAGMA foreign_keys=ON; bound conflict/enforcement/board/schedule/notification scans; calendar sync concurrency; avatar Cache-Control/ETag. Change control: `2026.07.25c`.
- PC-351: Batch sleeping syncs one all-day free Google/ICS event per night (LOCATION field + `, at Location` in title); non-batch multi-day sleeping stays one span; resolved sleeping titles omit Confirmed; SCHEMA_VERSION 37 (`calendar_event_links.night_key`). Change control: `2026.07.24e`.

### Fixed
- PC-362 (test): SCHEMA_VERSION 42 re-runs migrations so `moderation_reason` / `moderation_expires_at` apply on DBs that already recorded v41 before moderation columns shipped (restores login). Change control: `2026.07.27b`.
- PC-362 (test): E2E navigation strict-mode flake on Rebel Alliance header. Change control: `2026.07.27a`.
- PC-353: Phase 0 security hardenings — hashed password-reset/email-verify tokens, paused-account gate, fail-closed e2e gates, magic-byte image validation, push endpoint ownership. Change control: `2026.07.25a`.

### Added
- PC-348 / PC-349: Onboarding Google OAuth restores Calendar step; inbox Open Proposal for partnerships; prune stale actionable notifications when the bell opens. Change control: `2026.07.24c`.
- PC-344: Public `/privacy` policy (auth, Turso/DB fields, Google Calendar encrypted tokens + Limited Use, Resend, web push, in-group sharing); middleware allowlist; links at bottom of Profile & Settings and front of first-login guided setup. Follow-up: Google access/use/store/share/delete + Limited Use / human-access language; token revoke + event-link purge on disconnect and account delete; public homepage with privacy link; connect-time disclosure; impersonation disables Google Calendar API/OAuth calls. Change control: `2026.07.23b`.
- PC-337–PC-342: External calendar integration (Option B) — Google Calendar OAuth sync into an existing personal calendar; iCal/Other via Download / Email / Both (.ics); Profile settings + skippable onboarding Calendar step; sleeping events export as all-day free/transparent with the PolyCal sleeping title; pending ICS download + notification when email is unavailable. SCHEMA_VERSION 36. Change control: `2026.07.23a`.
- PC-325–PC-326: Playwright journeys for poll required/optional approve + decline-with-note paths, and self-appointment day boundaries at 12am/11pm (1h/2d, weekly×3). Change control: `2026.07.22g`.
- PC-298: Feed pins currently-happening non-sleeping (resolved) events in a sticky **Happening now** highlight stack above the timeline; silent poll tracks active window changes. Change control: `2026.07.22b`.
- PC-291–PC-296: Proposed Kanban **Nudge** for pending voters (1h cooldown); live proposed/at-risk expiry countdowns on summary cards; admin **hard-delete** of proposals in any state (including archived), with `proposal_admin_deleted` notify to all participants. Change control: `2026.07.22a`. SCHEMA_VERSION 34 (`last_nudge_at`).
- PC-279: Feed URL embeds — linkify chat/comment bodies and show Facebook-style Open Graph preview cards (SSRF-safe cache). Change control: `2026.07.21f`. SCHEMA_VERSION 31.
- PC-278: Optional invitees keep Proposed visibility + actionable resolve notification after required attendees resolve (extend PC-49 to non-polls). Change control: `2026.07.21e`.
- **Production release `2026.07.21-prod` (PC-271):** Consolidated Code Status entry for this promote — Feed Controls (PC-264–268), six-item UX batch (PC-258–263), FEED/like parrot sizing (PC-270; supersedes interim PC-260/269 sizes), brace-expansion/js-yaml audit patches (PC-258).

### Changed
- PC-334–PC-336 (Epic 6): Auth/prefs polish (behavior-preserving). Admin server actions in `admin.ts`, `poly-group.ts`, and `users.ts` now route through the shared `requireAdminAccess` helper instead of duplicating raw `role==="admin"` / local `requireAdmin(session)` gates — semantics are identical (`userHasAdminAccess` === role `admin`), and provisioning paths that intentionally allow non-admins are unchanged (PC-335). Removed the dead "SMS (coming in a later release)" channel checkbox from the first-login onboarding wizard (email/in-app/push paths unchanged; SMS backend field left in place) (PC-335). `getFeedUpdateTokenAction` no longer hydrates the full first page to build a token — it computes a cheap COUNT/MAX fingerprint (milestones, chat messages/comments, proposal comments, likes + viewer likes, proposal edits, active-event set); `listFeedItemsAction` returns the same fingerprint so silent polls baseline without an extra round-trip (PC-336). Change control: `2026.07.22j`.
- PC-331–PC-333 (Epic 5): Schema hygiene (behavior-preserving). `admin-migrations` no longer ensures the long-retired `poly_group` columns (`allow_group_name_proposals`, `group_name_change_mode`, `power_management_mode`, `role_snapshots_json`, `event_privacy_open/private/super_private`, `admin_can_see_private/super_private`, `sleeping_network_visibility`) and `proposals-migrations` no longer ensures the legacy hour columns (`recovery_max_hours`, `proposed_max_hours`, `at_risk_ttl_hours`) (PC-332). The `pc280` cleanup and the hours→days enforcement backfill now guard their UPDATEs on `PRAGMA table_info` column presence so fresh DBs no longer crash, while still setting `pc280_cleanup_v1` / `enforcement_hours_to_days_v1` so migrations never retry (PC-332). Dead fields removed from the Drizzle schema; SCHEMA_VERSION 34→35 (verify-turso-schema synced) (PC-333). Existing DBs keep their columns (no `DROP COLUMN`). Change control: `2026.07.22i`.
- PC-327–PC-330 (Epic 4): Proposals `_core` god-module carve (behavior-preserving). Conflict detection + on-resolve auto-decline moved to `src/lib/proposals/services/conflicts.ts` (PC-328); the resolution engine (poll tallying, resolve/revert, per-slot aggregate sync, sleeping title/schedule helpers) moved to `src/lib/proposals/services/resolution.ts`, with `APPROVING_VOTES`/`APPROVING_SLOT_VOTES` relocated to `proposals/constants.ts` (PC-328); resolved-proposal lifecycle actions moved to `src/actions/proposals/lifecycle.ts` and comment actions to `src/actions/proposals/comments.ts`, re-exported through `@/actions/proposals` and the sub-facades so the public server-action API is unchanged (PC-329/PC-330). `_core.ts` shrank from ~3.9k to ~2.1k lines and dead partner-alias wrappers were dropped in favor of importing `@/lib/proposals/partners` directly. Change control: `2026.07.22h`.
- PC-320–PC-323 (Epic 3): Proposal state-transition + notification consolidation. Single `logProposalTransition` (state-log) accepts transaction executors and is the only `proposal_state_log` writer (removed the duplicate `slices` logger and the `enforcement`/`pending-recovery` `logSystemTransition` helpers) (PC-321); new shared `notifyProposalParticipants` fan-out backs stakeholder notifications, with the `_core` stakeholder helper, slice detach notice, resolve optional-RSVP copy, at-risk proposer-vs-invitee copy, and the redraft/auto-cancel/revert loops rewired as thin wrappers with identical copy/metadata (PC-322); `FEED_*` allowlists + `contentKindForMilestoneAction` moved into a typed `transition-catalog` beside state-log, re-exported by `feed/prefs-filter` so no new actions surface in Feed (PC-323). Change control: `2026.07.22f`.
- PC-317–PC-319: Date-only contract documented (sleeping = midnight-in-TZ, all-day = noon-UTC); conflict detection reuses the calendar's `buildScheduleWindows` with widened sleeping/all-day windows so same-night sleeping and same-day all-day collide while events never conflict with sleeping (PC-59); draft sleeping/batch preview uses the sleeping helper; single `intervalsOverlap` from `schedule/dates`; viewer TZ passed into slice-detach span expansion. Change control: `2026.07.22e`.
- PC-305–PC-307: Shared partners/eligible-locations loaders; `canViewProposalContent` for schedule Busy masking; dead masked=false scaffolding removed; admin calendar toggle label matches uninvolved-admin masking. Change control: `2026.07.22d`.
- PC-280: UX cleanup batch — removed Planning drawer, Clone proposal, group-name-change proposals, and admin power management ("all admins" toggle, impersonation unaffected); sleeping network visibility hard-defaulted to "involved" (admin toggle removed); private/super-private event privacy removed entirely (every proposal always open, admin privacy toggles removed, masking simplified); removed descriptive tab blurbs (Feed/Schedule/Proposals/People & Places/Admin; Profile "Signed in as" kept); draft Delete/Exit and proposal detail footer actions use pill outlined/contained styling; Feed composers default to 2 rows with Enter = newline. SCHEMA_VERSION 32 (privacy backfill, power-management + sleeping-visibility column cleanup). Change control: `2026.07.21g`.
- PC-277: Feed like bird enlarged to 36×36 (3× the prior 12×12). Change control: `2026.07.21d`.
- PC-273–PC-276: Proposal enforcement days units + sleeping-partner auto-delete TTL; admin draft delete + uninvolved visibility toggle; peach oversight only when uninvolved; higher-quality event icon watermarks on kanban; GitHub Actions bumped to Node 24 runtimes (`@v5`). SCHEMA_VERSION 30. Change control: `2026.07.21c`.
- PC-270: Bottom FEED parrot matches sibling nav icons (24×24); feed like birds half that (12×12). Change control: `2026.07.21b`.

### Fixed
- PC-335 (Epic 6): Corrected the Profile quiet-hours help text, which wrongly claimed email "still delivers" during quiet hours — email is in fact suppressed alongside in-app and push (urgent alerts still come through), matching `shouldSuppressEmailDelivery`. Change control: `2026.07.22j`.
- PC-301–PC-303: Single-day all-day events stay on one calendar day and open without Day not part of a multi-day span; slice detail/detach failures write System administrator log errors; resolving sleeping/batch proposals refreshes Tentative→Confirmed in the stored title. Change control: `2026.07.22c`.
- PC-299: Actor-authored proposal, place, and user-lifecycle notifications name the initiating user (no more hardcoded “An admin” / “an administrator”); admin activity logs attribute `notification.*` rows to the actor while preserving the recipient in details. Change control: `2026.07.22b`.
- PC-280: Sleeping proposals no longer show as "past" until the whole calendar day elapses (board + proposal cards); Schedule overlap/red-conflict check no longer flags a sleeping arrangement against an event on the same night (PC-59 parity). Change control: `2026.07.21g`.

### Added
- PC-264–PC-268: Feed Controls — Settings cog, presets, Detailed Tweaking (Who/What), account-persisted feed prefs, server-side filter, votes milestones. Change control: `2026.07.21`.

### Changed
- PC-269: Feed like bird enlarged to 40×40. Change control: `2026.07.21`.
- PC-258–263: Six-item UX batch — month all-day span merge/TZ bounds; feed image 4MB limit + error handling; Feed parrot nav icon 1.5×; draft-return notification revoke+replace; hide batch Reschedule; conflict messages list overlaps. Change control: `2026.07.20`.
- PC-257: Feed Code Status starts minimized and expands via chevron (same collapsible pattern as Admin). Change control: `2026.07.17`.

### Added
- PC-254: Code Status panel on Feed for all users (shared with Admin). Change control: `2026.07.16d`.
- PC-250: Feed comments visible only to admins (e.g. sleeping arrangements under involved-only network visibility) show a yellow background. Change control: `2026.07.16c`.

### Changed
- PC-251 / PC-252–256: Feed unbroken-text wrap; expanded proxy voting (proposer or sleeping partners); Passive→Proxy user-facing labels; maxLength gap fill on admin fields. Change control: `2026.07.16d`.
- PC-243 / PC-244–249: Character limits (256/1024), human-readable activity logs, passive proxy voting, feed comment image reliability, hide Open-only Event Privacy, feedback FAB position/z-index. SCHEMA_VERSION 28. Change control: `2026.07.16b`.

### Fixed
- PC-258: Multi-day all-day events no longer render as overlapping 2-day month bars in US timezones.
- PC-259: Feed picture upload no longer throws digest-only Server Action errors for images up to 4MB.
- PC-253: Feed chat/comment Typography wraps long unbroken strings.
- PC-239: Feed background poll uses a head fingerprint and only refreshes when content changes (no 15s loading spinner flash); E2E skips feature-push runs when an open PR already covers the branch; same-day all-day redraft keeps end=start so moved events stay visible.
- PC-216 / PC-217–219: Accepting or declining a proposal (Proposals UI or notification bell) soft-dismisses matching actionable inbox rows so they stay cleared after reload; bell vote rows include Decline.
- PC-213: Mobile smoke no longer shares SERIAL w0; workers≤1 serializes SAFE behind serial.
- PC-209: All Day / sleeping End day typing no longer lexicographically swaps into Day until both values are valid ISO dates.

### Added
- PC-214: `E2E_REUSE_SERVER` opt-in, `test:e2e:cleanup`, `test:e2e:journeys`, parallel e2e prepare, `testManualDb` for heavy serial journeys.
- PC-215: E2E multi-server monitoring canvas (topology + flake classes).
- PC-210: `dates-times-journey` covering Window / All Day / Poll / Recurring valid and invalid When fields.
- PC-211: Playwright CI matrix expanded to 5 shards.

### Previously
- PC-207: Branded `/verify-email` landing for notification email confirmation (Continue to PolyCal); legacy `/api/verify-email` redirects.
- PC-202: Garden-branded loading splash, streamed app shell, and PWA “Updating PolyCal…” cue after new builds.
- PC-203: Swipe left/right on main content to move between bottom tabs.
- PC-204: Schedule Day period with 12a–12a hour grid and all-day strip.

### Changed
- PC-350: Playwright CI shards by suite (serial×3 + safe×2) instead of flat `--shard=N/5`, so SERIAL_ONLY is not packed into early jobs; lean server topology per suite. Change control: `2026.07.24d`.
- PC-205: Removed status legend from schedule View options (network filter remains).

## [2026.07.13c] - 2026-07-13

### Added
- PC-202: Garden-branded loading splash, streamed app shell, and PWA “Updating PolyCal…” cue after new builds.
- PC-203: Swipe left/right on main content to move between bottom tabs.
- PC-204: Schedule Day period with 12a–12a hour grid and all-day strip.

### Changed
- PC-205: Removed status legend from schedule View options (network filter remains).

## [2026.07.13b] - 2026-07-13

### Added
- PC-199: Place owners/admins can remove accepted members from a place card (last owner protected; audit `places.remove_person`).

### Fixed
- PC-200: Residency self-join proposal shows read-only “Requesting for: you” instead of a grayed Person select.

## [2026.07.13] - 2026-07-13

### Added
- PC-193: Place owners/admins can change accepted members between Resident and Owner (last-owner demotion blocked).
- PC-194: Onboarding collects notification email (verify link sent; finish not blocked) and timezone (defaults to America/New_York).
- PC-196: Admin oversight proposals use a light orange background on the board and in detail.

### Changed
- PC-197: Sleeping Partner Proposal list includes passive profiles (auto-accept).

### Fixed
- PC-195: People & Places Add place / Add person buttons remain usable on small screens.
- PC-184: Alpha Feedback — Save notifies submitter when a submitter comment is present; Notify button removed.
- PC-170 / PC-171: Recurring combinable with Window/All Day; recurrence configurator under date fields.
- PC-178: Admin User management two-line mobile layout.
- PC-179: Production admin impersonation when `AUTH_IMPERSONATION_SECRET` is set.
- PC-180: People & Places tab label MAP → Sleeping Partners.
- PC-174–176: E2E speedup — shared CI Next build, luke storageState, SAFE_PARALLEL per-worker DBs.

### Added
- PC-182: Alpha Feedback screenshot full-size lightbox.
- PC-183: Alpha Feedback dated comment log on Save (clears draft fields).
- PC-172: Restore DEV (red) / TEST (yellow) environment banners.

### Fixed
- PC-168: SCHEMA_VERSION 21 so `password_reset_token` columns apply on hosted Turso DBs.

### Added
- PC-164–167: Schedule UX refactor — unified period chrome, day sheet, create FAB, mobile agenda, URL/a11y.
- PC-160–162: Resend email on `polycal.net` — hardened verify links, credential emails on provision/admin reset (clipboard fallback), self-service forgot/reset password.


### Added

- PC-156: Onboarding Welcome stays until the user clicks OK (complete only on acknowledge).
- PC-152: Draft schedule mode grid (Window / All Day / Poll / Recurring); Poll disables Recurring.
- PC-153: Two-click date range calendar for all-day events and sleeping nights.
- PC-144: `/api/health` readiness probe (`ensureDbReady` + schema version) for optional warmup.
- PC-138–PC-139: Proposal detail loading skeleton (defer Close until loaded); route `loading.tsx` for people-places, admin, and app shell.

### Changed

- PC-155: When “Any user can add people” is on, only admins can choose User/Admin; other provisioners always create User accounts (server-enforced).
- PC-157: Soft-deleted users are omitted from Admin → User management (no “Former User” rows).
- PC-158: Card/dialog text and poll responses wrap instead of requiring horizontal swipe.
- PC-148: Toast snackbar vertically centered (no longer covers bottom AppTabs).
- PC-149: Removed build/branch environment banner from AppShell; impersonation lives under Admin → Test data.
- PC-150: Sleeping titles drop brackets — `Sleeping: Name, Status, at Place`.
- PC-151: Tighter vertical spacing around event icons on cards and detail.
- PC-143: `runMigrations` short-circuits when `schema_meta.version` matches `SCHEMA_VERSION` (skips Turso PRAGMA storm on cold start).
- PC-144: JWT user-row refresh throttled (~60s TTL); `SessionProvider` disables refetch-on-focus.
- PC-145: `dynamic()` code-split for proposal/schedule dialogs and heavy admin panels.
- PC-140–PC-141: Parallelize `(app)` layout data fetches; skip schedule client double-fetch when server payload is already the current week.
- PC-134: New proposal privacy MenuItems respect poly group settings (hide disabled private/super-private; reappear when enabled); server rejects disabled levels.
- PC-135–PC-136: Alpha feedback tracker Delete (permanent) and Archive list (`archivedAt`, `?archived=1`); toolbar link between Active inbox and Archive.
- PC-130: Usable ESLint flat config (`eslint.config.mjs`); `eslint-config-next` pinned to 15.x; `npm run lint` non-interactive.
- PC-128: GitHub Actions CI for `apps/alpha-feedback-tracker` (tsc + Vite build on path changes); document GitLab CI as secondary.
- PC-131: Tracker React/`@types` aligned with root; ARCHITECTURE documents no npm workspaces for `apps/alpha-feedback-tracker`.
- PC-132: ProposalDraftDialog split into event/sleeping/more-options section components (UX unchanged).
- PC-124–PC-127: Proposal card & draft form UX — shared what→when→where→act card scan; digital event times; type-aware progressive drafts (event vs sleeping vs batch); explicit Required/Optional invitees; Save secondary / Submit primary; privacy and notes helper copy.

### Added

- PC-118–PC-122: Alpha tester feedback system — in-app FAB (screenshot + bug/feature form with silent diagnostics), Turso `alpha_feedback_submissions` (schema v19), admin list/detail/patch/notify API, and Tauri Windows tracker app under `apps/alpha-feedback-tracker/`.

### Fixed

- PC-147: Detaching a night/day from a series no longer throws Failed query (stakeholder notify runs after the DB transaction commits).
- PC-114: Detach slice migration on remote DBs; MAP visibility defaults to Everyone; month heat-map ring on day numbers.
- PC-112: Custom avatar crop — react-easy-crop, zoom out (0.5×–3×), load-gated confirm, JPEG background fill, server-side minimum crop size.
- PC-117: Schedule time labels use viewer timezone for same-day evening events (unit test coverage).

### Added (continued)

- PC-117: Optional profile bio on first login and settings; shown under names in People & Places.
- PC-115: Event schedule views user journey E2E (10 serial flows: solo/recurring, invitee votes, week/2-week/month).
- PC-116 (phase 1): Optional event category icons — registry, DB column, draft picker, week calendar watermark.
- PC-116 (phase 2): Event icon on proposal cards and detail dialog.
- PC-116 (phase 3): Event icon on month calendar icons and planning drawer.
- PC-116 (phase 4): Icon propagation on clone/recurrence/detach; E2E coverage; removed generic EventSocialIcon.
- PC-114: Event social watermark icon (microphone, pizza, pine tree); MAP tab shows member avatars in partnership graph.

- PC-98: Extracted proposal at-risk, vote reset, and state-log services from `_core.ts`.
- PC-87: E2E passive-user journey (create passive, admin activate, first login).
- PC-91: E2E notification inbox journey; extended `e2e/helpers/notifications.ts` with Accept/Dismiss/Clear helpers.
- PC-86: E2E impersonation journey (dev bar + admin panel + audit log).
- PC-88: E2E overlap/revoke acceptance journey (in-flight overlap warning, acknowledge, revoke).
- PC-97: Adopted `requireSession` / `withDb` in schedule, impersonation, profile, and user provisioning actions.
- PC-77: `computeScheduleFetchRange` helper for explicit week/month API windows.
- PC-76: `viewed_at` on `proposal_invitees` to track when an invitee first opens proposal detail (separate from vote status).
- PC-76: Shared invitee display helpers (`invitee-display-status.ts`, `invitee-view.ts`) and unit tests.
- PC-75: Shared schedule slice authorization module (`slice-auth.ts`) — unified masking, slice membership validation, comment permissions, and slice tag validation.
- PC-75: `useScheduleTapRouter` hook for schedule tap routing and mutually exclusive dialog state.
- PC-75: Hardened E2E schedule navigation helpers (`schedule-ready` wait, week layout force, range-based navigation, localStorage reset).
- PC-75: Restored batch-sleeping and multi-day slice journey E2E specs with unique locators.
- PC-75: Recurrence parent occurrence-0 windows on the schedule calendar.
- PC-75: "Not on calendar" badge on resolved proposal cards and planning drawer when no schedulable windows exist.
- Admin **Code Status** panel (replaces Force Reload): live build number, change control log, **Check for Update**, full log behind build-number link.
- Structured change control log (`src/lib/changelog/entries.ts`), `/api/build-info`, build-time stamp (`NEXT_PUBLIC_BUILD_TIME`).
- All-day event proposals (no clock times) across schedule, cards, and detail.
- Proposal notifications include when/where detail plus inline Accept / Open Notification actions (in-app + Web Push).
- PC-65: Split FAB entries for event vs sleeping proposals; variable event reminders; four alert-type notification prefs; avatar crop before upload; solo calendar labels show proposer name.
- PC-53: Pending-recovery TTL; schedule network busyness heatmap; Resend email delivery; admin user gender column; production admin bootstrap script.
- PC-52: Playwright journey for admin provisioning an active user; test environment scripts and Burton-Thompson seed validation.
- PC-51: Render Blueprint with hourly dev/test enforcement cron jobs.
- PC-50: Sleeping network notifications when partnerships change; `initiatedByUserId` on partnership proposals.
- PC-49: Optional poll invitees keep proposal in Proposed until they vote.
- PC-48: Attendee-update notifications; at-risk resolved flow; recurring series archive; cron enforcement API; user timezone; admin reschedule; places list collapse; clone proposal; MUI date/time pickers.
- Phase 9 enforcement (PC-46): admin-configurable TTLs, overlap acknowledge/decline, centralized enforcement runner.
- PC-47: Draft submit conflict confirmation; People & Places Add place dialog; admin sections collapse by default.
- PC-45: Post-resolution attendee removal; profile quiet hours; admin pause/delete workflow; group name change proposals.
- PC-43: Web Push, actionable inbox, notification email with verification token.
- PC-40 / PC-42: Resolution collision engine; weekly/two-week calendar; planning mode drawer.
- Phase 1–2 foundation: Kanban seed, credentials auth, Turso schema, dev bar, Star Wars seed, Serwist PWA.
- Workflow: `npm audit` gate, Jira sync automation, GitHub PR promotion, `.requirements` traceability, CI `PC-xxx` validation.

### Changed

- PC-77: Month view single-day events render as compact status icons; multi-day spans unchanged.
- PC-76: Invitee chips show **Not yet viewed**, **Pending response**, or vote outcome based on `viewed_at` + `vote_status`.
- PC-76: `getProposalDetailAction` idempotently stamps `viewed_at` for unmasked invitees on proposed/resolved proposals.
- PC-76: Board `needsViewerAction` aligned with detail `canVote` for resolved required invitees.
- PC-75: `listScheduleEventsAction` filters proposals and slots by date overlap at query time instead of full-table scan.
- PC-75: Week view places span events on all spanned day columns.
- PC-75: `detachProposalSliceAction` runs in a DB transaction with idempotency; archives parent when all slices detach.
- PC-75: `SliceDetailDialog` adds loading state, request-sequence guard, and detach confirmation.
- PC-75: `ScheduleClient` adds stale-response guard on `refreshSchedule` and E2E range test attributes.
- Replaced the admin "Force Reload" panel with "Code Status".

### Fixed

- PC-77: Month view no longer fetches only the current week after toggling from week view (stale layout closure).
- PC-77: Month day cells use uniform height with status-colored calendar icons for single-day events.
- PC-77: Schedule legend swatches use semantic fill colors instead of near-black text ink.
- PC-76: Invitee status no longer stays on "Not yet viewed" after the invitee opens the proposal.
- PC-75: Sleeping-arrangement privacy (`hideSleepingArrangements`) applied in slice detail reads.
- PC-75: `virtual_span_day` slice detail validates day membership in parent span.
- PC-75: Comment `sliceTag` validated against proposal slice structure before insert.
- PC-75: `canComment` rules aligned between slice UI and `addProposalCommentAction`.
- Onboarding sign-in URL derived from running deployment instead of hardcoding production.
- PC-65: Calendar week anchor preserved when closing event detail; residency metadata safe-parse; block standard draft editor from corrupting special-proposal JSON.
- PC-53: Block submit/auto-resolve when proposal has zero required invitees and is not solo.
- PC-52: First-login onboarding saves avatar/theme via dedicated server action.
- PC-50: Relationship proposal cards no longer say "with you" for third-party partnerships.
- PC-49: Poll matrix time slots show label and date/time on separate lines; proposal detail scrolls to All responses.
- Sleeping partnership proposals visible on Proposals tab; draft dialog scrolls on small screens; schedule localStorage week anchor; re-draft opens draft editor.
