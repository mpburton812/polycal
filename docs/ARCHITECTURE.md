# Architecture — PolyCal

High-level structure for the PolyCal PWA (Next.js on Vercel, TypeScript, Turso/libSQL).

## Repository layout

```
polycal/
├── app/                    # Next.js App Router (pages, API routes, layouts)
├── android-twa/            # Bubblewrap TWA (app.polycal) + home-screen compose widgets
├── src/
│   ├── actions/            # Server actions (default mutation/read entry point)
│   ├── components/         # React UI
│   ├── lib/                # Domain logic, DB, auth, schedule, proposals
│   └── types/              # Shared TypeScript types
├── apps/
│   └── alpha-feedback-tracker/  # Tauri desktop triage UI (separate package)
├── e2e/                    # Playwright specs (journey + regression)
├── scripts/                # Tooling (requirements, Jira sync, CI helpers)
├── docs/                   # Architecture, workflow, ADRs, security
├── .requirements           # Requirement delivery log (append-only)
└── .github/workflows/      # Primary CI (GitHub Actions)
```

GitLab CI (`.gitlab-ci.yml`) is a **secondary/legacy mirror** of a subset of gates for alternate remotes; **GitHub Actions is the primary promotion path** for this project.

### Companion app: alpha-feedback-tracker

`apps/alpha-feedback-tracker` is intentionally **outside** the Next.js TypeScript project (`tsconfig.json` excludes `apps/`) and is **not** an npm workspace member. Root Next (Vite 8 for Vitest) and the tracker’s Vite 6 toolchain must not hoist together. Keep separate `package-lock.json` files; align React/MUI majors manually when bumping. Path-filtered CI (`.github/workflows/alpha-feedback-tracker.yml`) runs `npm run build` (tsc + Vite). Full Tauri installer builds remain local (Windows + Rust). The tracker talks only to PolyCal admin HTTP APIs — never to Turso directly.

### Android TWA (`android-twa/`)

Bubblewrap Trusted Web Activity for **Play-shaped** Android packaging of the same
PWA (`applicationId` `app.polycal`, origin `https://polycal-ebon.vercel.app`).
Home-screen NLP / New Event bars live in that package and open
`/feed?compose=` inside the TWA (not a Custom Tab). Digital Asset Links:
`public/.well-known/assetlinks.json`. Apple users stay on the Safari PWA.
See `android-twa/README.md`. Bubblewrap is a **global** CLI (`npm run twa:ensure`); it is not a lockfile dependency. Play Console listing remains a later epic.

## Layer model

```
app/  →  src/actions/  →  src/lib/  →  src/lib/db/
         (thin facades)    (domain)     (Drizzle ORM)
```

| Layer | Responsibility |
|-------|----------------|
| `app/` | Routing, layouts, server components that call actions |
| `src/actions/` | Auth/session checks, input validation (Zod), `revalidatePath` |
| `src/lib/` | Business rules, proposal state machine, schedule slices, RBAC |
| `src/lib/db/` | Schema, migrations, `getDb()` |

### Server action vs API route

Use an **API route** when the caller is external, binary streaming is required, or Auth.js/cron/SW callbacks need HTTP semantics. Otherwise use a **server action**.

| Use API route | Use server action |
|---------------|-------------------|
| Auth.js (`/api/auth/*`) | Form mutations, reads from React |
| Cron (`/api/cron/*`) | Proposal vote, schedule list, profile |
| Avatar binary stream | Admin user CRUD |
| E2E harness (`/api/e2e/*`, non-prod) | Notification inbox actions |
| Build info (`/api/build-info`) | |
| Health / warmup (`/api/health`) | |

Shared helpers: `src/lib/actions/context.ts` (`requireSession`, `requireAdminAccess`, `withDb`).

## Core systems

| Layer | Technology |
|-------|------------|
| Frontend | Next.js PWA, Material UI (Garden Brutalism tokens), WCAG 2.1 AA |
| Auth | Auth.js credentials provider, HttpOnly JWT cookies, `sessionVersion` invalidation |
| External calendars | Google Calendar API (OAuth connect, not login) + ICS download/email (Option B); tokens encrypted with `CALENDAR_TOKEN_ENCRYPTION_KEY`. See [GOOGLE-CALENDAR-SYNC.md](./GOOGLE-CALENDAR-SYNC.md) for sync notifications, triage, and recovery. |
| Database | libSQL — `file:local.db` (local), Turso (`polycal-dev` / `polycal-test` / `polycal-prod`) |
| Hosting | Vercel (+ Render cron for dev/test enforcement) |
| Identity roles | **Sponsor** (one per network; maps to legacy admin), Network Admin, User (active), Proxy (schedulable, upgrade path to User; DB role `passive`). Platform Admin is an account flag, not a network membership. |

## Admin capability matrix

| Capability | `role === "admin"` | Notes |
|------------|-------------------|--------|
| Admin panel (`/admin`) | Yes (also sponsor / network_admin / platform admin) | Entry via **header profile menu** (below Platform admin), not bottom tabs (PC-393). Platform dashboard lives only on `/platform-admin`. Sponsor-only DELETE starts a 24h `pending_delete` lock then hard-wipe (PC-460 / PC-462). |
| Pause/delete users | Yes | Sponsor membership cannot be demoted or removed. |
| Impersonation | Yes when `AUTH_IMPERSONATION_SECRET` is set | Admin User management (prod allowed); Test data / DevBar non-prod only |
| Message of the Day | Network admin (network scope) / Platform admin (all nodes) | Pop-up via `MotdPopupHost`; dismiss-once ack; optional `endsAt` (PC-392). Platform System Log is a separate operator queue (`PlatformLogAlertHost`), not the human MOTD composer (PC-463). |
| Sleeping proposal visibility | Involved-only (hard default) | Proposer, invitees, and admins when `adminCanSeeUninvolved`; masked copy shows “Busy” / Hidden for non-participants |

Server actions that gate on admin use `userHasAdminAccess` (role-based; no delegated power-management).

## Proposal state machine (summary)

```
draft → proposed → resolved → archived
         ↓           ↓
      expired    at_risk / pending_recovery
```

Votes, overlap warnings, collision auto-decline, and enforcement TTLs are implemented in `src/lib/proposals/` and `src/actions/proposals/`. See `src/lib/proposals/enforcement.ts` for cron-driven transitions.

## Schedule slice model (summary)

Calendar events are **slices** derived from proposals (single-day, multi-day span, virtual span day, recurrence occurrence, sleeping batch). Authorization and masking live in `src/lib/schedule/slice-auth.ts`. Fetch windows: `src/lib/schedule/fetch-range.ts`.

## Requirements traceability

All planned work lives in **Jira (PC)**. Delivered work is logged in **`.requirements`** and linked by `PC-xxx` in commit messages.

**Full process:** [REQUIREMENTS-WORKFLOW.md](./REQUIREMENTS-WORKFLOW.md)

## Environment isolation

| Environment | Branch | Database |
|-------------|--------|----------|
| Local / feature | `feature/*` | `file:local.db` or Turso `polycal-dev` |
| Dev | `dev` | Turso `polycal-dev` |
| Test | `test` | Turso `polycal-test` |
| Production | `production` | Turso `polycal-prod` |

Non-production seeding scripts must never run in production. Startup validation should reject `file:` URLs when `NEXT_PUBLIC_APP_ENV=production` (see [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md)).

## Security baseline

- Deny-by-default authorization (RBAC + proposal-level `viewerCanSeeProposal`)
- Secrets via environment variables only
- No session tokens in `localStorage` / `sessionStorage`
- OWASP-aligned input validation (Zod on actions)
- Production promotion checklist: [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md)

## ADRs

| ADR | Topic |
|-----|-------|
| [ADR-001](./ADR-001-inline-migrations.md) | Inline migrations at startup (version short-circuit on match) |
| `docs/adr/` | Future ADRs (next-auth beta, action vs API) |

## Testing model

| Layer | Tool | Location |
|-------|------|----------|
| Domain lib | Vitest | `src/lib/**/*.test.ts` |
| Server actions | Vitest + mocked `auth()` | `src/actions/*.test.ts`, `src/lib/actions/test-harness.ts` |
| User journeys | Playwright | `e2e/*journey*.spec.ts`, `e2e/mobile-smoke.spec.ts` |
| CI E2E | Playwright (suite-scoped: serial×3 + safe×2) | `.github/workflows/e2e.yml` |

Journey inventory and gaps: [E2E-PARALLEL-JOURNEYS.md](./E2E-PARALLEL-JOURNEYS.md).
