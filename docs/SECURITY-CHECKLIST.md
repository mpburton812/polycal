# Security checklist — production promotion

Use this checklist before opening or merging a **`test` → `production`** PR. High-severity items from the codebase assessment (PC-74 epic) should be resolved or explicitly waived with compensating controls documented in the PR.

## Critical (blocks production)

- [ ] No **Critical** findings in the latest security review or `npm audit` (critical/high unresolved)
- [ ] `NEXT_PUBLIC_APP_ENV=production` on the production deployment
- [ ] Production Turso database (`polycal-prod`) — no `file:` local DB URL
- [ ] `E2E_TEST_MODE` unset or `0` in production; `/api/e2e/*` routes unreachable
- [x] `/api/e2e/*` fails closed on any production signal — `NEXT_PUBLIC_APP_ENV=production`, `NODE_ENV=production` without a declared non-production tier, or a `polycal-prod` `TURSO_DATABASE_URL` (PC-353)
- [ ] Impersonation uses dedicated `AUTH_IMPERSONATION_SECRET` only (never falls back to `AUTH_SECRET`); unset secret disables impersonation even for admins
- [x] Impersonation denied on the production tier unless `ALLOW_PROD_IMPERSONATION=1` is set deliberately; leave it unset for normal production operation (PC-353)
- [ ] Seeding scripts and Test data panel excluded from production build

## High (resolve in parallel; track in Jira PC-74)

- [ ] E2E API routes require `E2E_API_SECRET` header when enabled (non-prod only)
- [ ] Self-service and admin password changes bump `sessionVersion`
- [ ] Avatar API (`/api/avatars/[id]`) authorizes owner or network relationship
- [ ] HTTP security headers configured (`next.config.ts`: HSTS, frame options, CSP baseline)
- [ ] Service worker does not cache authenticated `GET /api/*` responses
- [x] Shared secrets (`CRON_SECRET`, `E2E_API_SECRET`, `AUTH_IMPERSONATION_SECRET`, admin bearer tokens) compared with `timingSafeEqualStrings` (`src/lib/crypto/timing-safe-equal.ts`) (PC-353)

## Authentication and sessions

- [ ] Auth.js JWT in **HttpOnly** secure cookies (no tokens in `localStorage`)
- [ ] `CRON_SECRET` set for `/api/cron/enforcement`
- [ ] `AUTH_SECRET` rotated per environment; unique across dev/test/prod
- [ ] Paused/deleted users invalidated via `sessionVersion`
- [x] Paused accounts rejected by `requireSession` and the alpha-feedback admin API, independent of `sessionVersion` timing (PC-353)
- [x] JWT refresh never TTL-skips the database read while an account is paused or the token carries no `sessionVersion` (PC-353)

## Authorization

- [ ] Admin actions use `userHasAdminAccess` (not raw role string alone)
- [ ] Proposal reads use `viewerCanSeeProposal` / schedule masking
- [ ] Proxy users cannot access admin surfaces
- [x] Alpha-feedback bearer tokens re-read role and status from the database on every request, so a demoted or paused admin loses access before the 12h token expiry (PC-353)
- [x] Push subscribe rejects an endpoint already owned by another account instead of reassigning it (PC-353)

## Data and secrets

- [ ] No secrets in git (`.env*` gitignored; Vercel env vars for deploy)
- [x] Verification tokens redacted from activity log when email unsent (PC-160)
- [x] Password-reset and email-verification tokens stored as SHA-256 digests (`hashLinkToken`); the raw token exists only in the emailed link (PC-353)
- [x] Rate-limit keys derive the client IP from proxy headers server-side — never from a client-supplied value (PC-353)
- [x] Every image upload surface (avatar, feed, alpha-feedback screenshot) validates magic bytes against the declared MIME (PC-353)
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
