# Architecture — PolyCal

High-level structure for the PolyCal monorepo (PWA on Vercel, TypeScript, Turso).

## Repository layout (target)

```
polycal/
├── app/                    # Next.js App Router (PWA)
├── src/                    # Shared UI, lib, types
├── scripts/                # Tooling (requirements, Jira sync, CI helpers)
├── docs/                   # Architecture, workflow, ADRs
├── .requirements           # Requirement delivery log (append-only)
├── .gitlab-ci.yml          # Primary CI (GitLab-style workflow)
└── .github/workflows/      # GitHub Actions (current remote)
```

## Core systems

| Layer | Technology |
|-------|------------|
| Frontend | Next.js PWA, Material UI, WCAG 2.1 AA |
| Auth | Auth.js (NextAuth) + Google OAuth, HttpOnly cookies |
| Database | libSQL — local SQLite (dev), Turso (test/prod) |
| Hosting | Vercel |
| Identity roles | Admin, User (active), Passive (schedulable, upgrade path to User) |

## Requirements traceability

All planned work lives in **Jira (PC)**. Delivered work is logged in **`.requirements`** and linked by `PC-xxx` in commit messages.

**Full process:** [REQUIREMENTS-WORKFLOW.md](./REQUIREMENTS-WORKFLOW.md)

## Environment isolation

| Environment | Branch | Database |
|-------------|--------|----------|
| Local / feature | `feature/*` | Local SQLite file |
| Dev | `dev` | Local / dev SQLite |
| Test | `test` | Turso `polycal-test` |
| Production | `production` | Turso `polycal-prod` |

Non-production seeding scripts must never run in production.

## Security baseline

- Deny-by-default authorization (RBAC: Admin, User, Passive)
- Secrets via environment variables only
- No session tokens in `localStorage` / `sessionStorage`
- OWASP-aligned input validation

## ADRs

Architecture Decision Records will be added under `docs/adr/` as significant decisions are made.
