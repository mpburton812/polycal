# Changelog

All notable changes to PolyCal are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2026.07.09] - 2026-07-09

### Added

- Production promotion: Sprint A/B user journey E2E (impersonation, overlap/revoke, passive user, notification inbox).

### Changed

- Proposal at-risk services extraction (PC-98); action context adoption (PC-97).

### Fixed

- Assessment security remediation (avatar IDOR, API secrets, session invalidation on password change).

## [Unreleased]

### Fixed
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
