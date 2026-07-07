# Changelog

All notable changes to PolyCal are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- PC-76: `viewed_at` on `proposal_invitees` to track when an invitee first opens proposal detail (separate from vote status).
- PC-76: Shared invitee display helpers (`invitee-display-status.ts`, `invitee-view.ts`) and unit tests.

### Changed

- PC-76: Invitee chips show **Not yet viewed**, **Pending response**, or vote outcome based on `viewed_at` + `vote_status`.
- PC-76: `getProposalDetailAction` idempotently stamps `viewed_at` for unmasked invitees on proposed/resolved proposals.
- PC-76: Board `needsViewerAction` aligned with detail `canVote` for resolved required invitees.

### Fixed

- PC-76: Invitee status no longer stays on "Not yet viewed" after the invitee opens the proposal.

- PC-75: Shared schedule slice authorization module (`slice-auth.ts`) — unified masking, slice membership validation, comment permissions, and slice tag validation.
- PC-75: `useScheduleTapRouter` hook for schedule tap routing and mutually exclusive dialog state.
- PC-75: Hardened E2E schedule navigation helpers (`schedule-ready` wait, week layout force, range-based navigation, localStorage reset).
- PC-75: Restored batch-sleeping and multi-day slice journey E2E specs with unique locators.
- PC-75: Recurrence parent occurrence-0 windows on the schedule calendar.
- PC-75: "Not on calendar" badge on resolved proposal cards and planning drawer when no schedulable windows exist.

### Changed

- PC-75: `listScheduleEventsAction` filters proposals and slots by date overlap at query time instead of full-table scan.
- PC-75: Week view places span events on all spanned day columns (fixes silent drop for overlap-visible events).
- PC-75: `detachProposalSliceAction` runs in a DB transaction with idempotency; archives parent when all slices are detached.
- PC-75: `SliceDetailDialog` adds loading state, request-sequence guard, and detach confirmation.
- PC-75: `ScheduleClient` adds stale-response guard on `refreshSchedule` and E2E range test attributes.

### Fixed

- PC-75: Sleeping-arrangement privacy (`hideSleepingArrangements`) now applied in slice detail reads.
- PC-75: `virtual_span_day` slice detail validates day membership in parent span (read path aligned with detach).
- PC-75: Comment `sliceTag` validated against proposal slice structure before insert.
- PC-75: `canComment` rules aligned between slice UI and `addProposalCommentAction`.

- Admin **Code Status** panel (replaces Force Reload): shows the live build number and when it went live in the current environment, the most recent change control entry, a **Check for Update** button that force-reloads when a newer build is available, and the full change control log behind the build-number link.
- Structured change control log (`src/lib/changelog/entries.ts`) updated on every environment promotion, `/api/build-info` endpoint, and build-time stamp (`NEXT_PUBLIC_BUILD_TIME`).
- All-day event proposals (no clock times) across schedule, cards, and detail.
- Proposal notifications include when/where detail plus inline Accept / Open Notification actions (in-app + Web Push).

### Changed

- Replaced the admin "Force Reload" panel with "Code Status".

### Fixed

- Onboarding sign-in URL is derived from the running deployment instead of hardcoding production.

- PC-65: Split FAB entries for event vs sleeping proposals; variable event reminders (schema, draft UI, cron sender); four alert-type notification prefs with legacy migration; avatar crop before upload; solo calendar labels show proposer name.

### Fixed

- PC-65: Calendar week anchor preserved when closing event detail; residency proposal metadata safe-parse on cleanup; block standard draft editor from corrupting special-proposal JSON.

### Added

- PC-53: Pending-recovery TTL when resolved proposals lose all required invitees; admin-configurable recovery hours.
- PC-53: Schedule network busyness heatmap (privacy-masked) and sticky week/filter toolbar.
- PC-53: Resend email delivery for notifications and profile email verification when `RESEND_API_KEY` is set.
- PC-53: Admin user table gender column; production admin bootstrap script (`scripts/create-prod-admin.mjs`).

### Fixed

- PC-53: Block submit/auto-resolve when a proposal has zero required invitees and is not marked solo.

### Added

- PC-52: Playwright journey for admin provisioning an active user (copy credentials, logout, first-login onboarding).
- PC-52: Test environment scripts (`test:env:test`, `validate-test-seed`) and login hint for Burton-Thompson seed; dev/feature keep Star Wars demo data.
- PC-51: Render Blueprint (`render.yaml`) with hourly dev/test enforcement cron jobs calling Vercel `/api/cron/enforcement`; `scripts/cron-enforcement.sh` runner; production cron template documented in Blueprint comments.
- PC-50: Sleeping network notifications when partnerships are added or removed (partners of affected users are notified).
- PC-50: Track admin-initiated partnership proposals (`initiatedByUserId`) with accurate Kanban/detail copy.

- PC-49: Optional poll invitees keep the proposal in Proposed until they vote; banner and tailored notification when required attendees have already approved and scheduled.

- PC-48: Attendee-update one-click notifications (maintain accept / decline) after proposer removes required invitees; at-risk resolved flow with proposer options, tentative calendar styling, and auto-cancel enforcement.
- PC-48: Recurring series archive when past final child occurrence; cron enforcement API (`/api/cron/enforcement`) protected by `CRON_SECRET`.
- PC-48: User-selectable timezone in profile; schedule display normalization; admin reschedule from calendar detail.
- PC-48: Places list collapsible by default (name, bedrooms, residents summary); clone proposal opens draft editor.
- PC-48: MUI X date/time pickers with analog clock for event draft start/end times; calendar picker for sleeping dates.

- Phase 9 enforcement (PC-46): admin-configurable proposed TTL, at-risk TTL, archive grace, and redraft deadline; proposed expiration, auto-archive after event end, centralized enforcement runner; overlap acknowledge/decline flow for voters.

### Fixed

- PC-52: First-login onboarding wizard now saves avatar/theme via a dedicated server action (timezone defaults to UTC).
- PC-50: Relationship proposal cards no longer say "with you" when the partnership is between two other named members.

### Fixed

- PC-49: Poll matrix time slots show label and date/time on separate lines; proposal detail dialog scrolls to reach All responses.

- Draft proposal submit now surfaces schedule conflicts in a confirmation dialog and at the top of the draft card (PC-47).
- People & Places: Add place uses a dialog button matching Add person (PC-47).
- Admin sections collapse by default with chevron expand/collapse; Logins column removed from user management (PC-47).
- Phase 7 post-resolution (PC-45): required attendee removal with notifications, redraft T−24h auto-repropose, overlap warnings for voters.
- Phase 2 profile completion (PC-45): quiet hours, alert-type toggles, custom avatar upload with API route.
- Phase 8 admin completion (PC-45): pause/delete user proposal workflow, audit log visibility tiers, group name change proposals.
- Phase 5 notifications (PC-43): Web Push subscription storage and service worker handler; actionable inbox (partnership accept/decline, proposal links); notification email with verification token; email delivery queue stub in activity log.
- Relationship proposals surface on Proposals Kanban with dedicated dialog; partnership actions send inbox notifications.
- Solo event toggle on event drafts; Submit button visible immediately after first draft save.
- Calendar blocks show time and participant names (privacy-masked when required); schedule week anchor always opens on current week.
- Sleeping drafts use date-only fields; location autocomplete with direct + sleeping-network places and custom text; schedule re-draft opens draft editor.

### Fixed

- Sleeping partnership proposals visible on Proposals tab (not only People & Places).
- Proposal draft dialog scrolls on small screens.
- Schedule localStorage no longer restores a stale week anchor.
- Re-draft from schedule/calendar opens the proposal draft dialog instead of leaving detail view only.

### Added

- Phase 4 close-out (PC-40): resolution collision engine auto-declines overlapping pending proposals into proposer review; notification inbox in app header; per-bedroom picker on sleeping drafts; schema v10 (`notification_dismissals`).
- Phase 6 schedule (PC-42): weekly/two-week calendar views, color-coded events, network filters, planning mode drawer, proposal detail from calendar blocks.

- Phase 1 foundation: demo proposals Kanban seed (all workflow columns), admin test DB reset, profile password change with first-login enforcement, avatar and accent theme preferences.
- Phase 2 People & Places: user provisioning with clipboard credentials, sleeping partnership graph, place CRUD with residency proposals.
- Credentials auth (Auth.js) with persistent JWT sessions in HttpOnly cookies.
- Turso/libSQL schema (users, poly group, locations, activity log, image blobs) with startup migrations.
- Non-production dev bar (build SHA, branch, env) and user impersonation dropdown.
- Star Wars seed foundation (10 users, 5 locations) for feature/dev/test environments.
- Serwist service worker and web app manifest.

### Added (workflow)
- `npm audit` promotion gate for `feature/*` → `dev` (`.cursorrules`, GitLab CI, GitHub Actions).
- Automated Jira status sync: In Progress (feature push), In Review (PR→dev), Done (merge→dev).
- GitHub PR required for all `feature/*` → `dev` promotions (`docs/DEV-PROMOTION.md`).
- PolyCal requirements workflow (`docs/REQUIREMENTS-WORKFLOW.md`) linking Jira PC tickets, git commits, and `.requirements` audit log.
- `.requirements` append-only traceability log with git hooks (commit-msg validation, post-commit append).
- CI validation for `PC-xxx` Jira keys on feature branches (GitLab CI + GitHub Actions).
- Optional Jira sync on merge to `dev` (transitions referenced tickets to Done).
- Architecture overview (`docs/ARCHITECTURE.md`).
