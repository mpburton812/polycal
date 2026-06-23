# Changelog

All notable changes to PolyCal are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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
