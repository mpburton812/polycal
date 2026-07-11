# Security checklist — production promotion

Use this checklist before opening or merging a **`test` → `production`** PR. High-severity items from the codebase assessment (PC-74 epic) should be resolved or explicitly waived with compensating controls documented in the PR.

## Critical (blocks production)

- [ ] No **Critical** findings in the latest security review or `npm audit` (critical/high unresolved)
- [ ] `NEXT_PUBLIC_APP_ENV=production` on the production deployment
- [ ] Production Turso database (`polycal-prod`) — no `file:` local DB URL
- [ ] `E2E_TEST_MODE` unset or `0` in production; `/api/e2e/*` routes unreachable
- [ ] Impersonation provider disabled in production (`AUTH_IMPERSONATION_SECRET` not used as fallback to `AUTH_SECRET`)
- [ ] Seeding scripts and dev bar excluded from production build

## High (resolve in parallel; track in Jira PC-74)

- [ ] E2E API routes require `E2E_API_SECRET` header when enabled (non-prod only)
- [ ] Self-service and admin password changes bump `sessionVersion`
- [ ] Avatar API (`/api/avatars/[id]`) authorizes owner or network relationship
- [ ] HTTP security headers configured (`next.config.ts`: HSTS, frame options, CSP baseline)
- [ ] Service worker does not cache authenticated `GET /api/*` responses

## Authentication and sessions

- [ ] Auth.js JWT in **HttpOnly** secure cookies (no tokens in `localStorage`)
- [ ] `CRON_SECRET` set for `/api/cron/enforcement`
- [ ] `AUTH_SECRET` rotated per environment; unique across dev/test/prod
- [ ] Paused/deleted users invalidated via `sessionVersion`

## Authorization

- [ ] Admin actions use `userHasAdminAccess` (not raw role string alone)
- [ ] Proposal reads use `viewerCanSeeProposal` / schedule masking
- [ ] Passive users cannot access admin surfaces

## Data and secrets

- [ ] No secrets in git (`.env*` gitignored; Vercel env vars for deploy)
- [x] Verification tokens redacted from activity log when email unsent (PC-160)
- [ ] Audit log captures admin identity events (`logUserActivity`)

## Operational

- [ ] `npm audit` clean on promotion PR chain
- [ ] Vitest green on promotion PR
- [ ] Playwright E2E green on promotion PR
- [ ] **User journey tests** run locally and pass (`e2e/*journey*.spec.ts`) — mandatory for production
- [ ] User journey pass status documented in PR test plan

## Related docs

- [DEV-PROMOTION.md](./DEV-PROMOTION.md) — feature → dev → test → production workflow
- [ARCHITECTURE.md](./ARCHITECTURE.md) — layer model and admin capability matrix
- Jira epic **PC-74** (assessment security hardening) for ticket-level remediation
