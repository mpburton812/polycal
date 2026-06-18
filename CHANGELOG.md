# Changelog

All notable changes to PolyCal are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `npm audit` promotion gate for `feature/*` → `dev` (`.cursorrules`, GitLab CI, GitHub Actions).
- PolyCal requirements workflow (`docs/REQUIREMENTS-WORKFLOW.md`) linking Jira PC tickets, git commits, and `.requirements` audit log.
- `.requirements` append-only traceability log with git hooks (commit-msg validation, post-commit append).
- CI validation for `PC-xxx` Jira keys on feature branches (GitLab CI + GitHub Actions).
- Optional Jira sync on merge to `dev` (transitions referenced tickets to Done).
- Architecture overview (`docs/ARCHITECTURE.md`).
