# AGENTS.md

## Cursor Cloud specific instructions

PolyCal is a single Next.js 15 (App Router) + React 19 PWA — the whole product is one
web service. Standard commands and the seeded login live in `README.md`; the workflow
rules live in `.cursorrules`. Only the non-obvious, environment-specific gotchas are below.

### Branches: the code is NOT on `main`
- `main` contains only `README.md`. All application code lives on `dev` (the integration
  branch); `feature/*` branches are cut from `dev` and PR back into `dev`.
- When starting cloud work, base your branch on `origin/dev` (e.g.
  `git checkout -b cursor/<name> origin/dev`), otherwise the working tree is empty.
- Because of this, the startup update script guards on `package.json` existing before
  running `npm install`, so it is safe on `main` (no-op) and on `dev`/feature branches.

### Local database — no external service needed
- The DB layer (`src/lib/db/client.ts`) defaults to a file-backed SQLite DB
  (`file:local.db`) whenever `TURSO_DATABASE_URL` is empty. Leave it empty for local dev;
  do NOT point at remote Turso. Migrations run programmatically at runtime and via
  `npm run db:seed` (which also seeds demo data + the `luke` / `ChangeMe123!` login).
- Turso (`libsql://…`) is only for hosted/prod-like envs and requires `TURSO_AUTH_TOKEN`.

### Required env
- Copy `.env.example` to `.env.local` and set `AUTH_SECRET` (Auth.js will not start
  without it): `AUTH_SECRET=$(openssl rand -base64 32)`. `AUTH_URL` defaults to
  `http://localhost:3000`. Everything else (Resend, VAPID push, Jira, cron) is optional
  and no-ops when unset.
- **Google Calendar (optional):** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_REDIRECT_URI` (e.g. `http://localhost:3000/api/calendar/google/callback`), and
  `CALENDAR_TOKEN_ENCRYPTION_KEY` (e.g. `openssl rand -base64 32`). Enable Calendar API +
  OAuth scopes `calendar.events` and `calendar.calendarlist.readonly` in GCP.

### Lint
- `npm run lint` runs `next lint` with the committed root `eslint.config.mjs`
  (FlatCompat + `next/core-web-vitals` / `next/typescript`). It is non-interactive.
  CI does **not** run lint yet — quality gates remain `npm run audit:check`,
  `npm run test:unit` (Vitest), and `npm run build` (see `.github/workflows/dev.yml`).
  `apps/` is ignored by the root ESLint config (tracker has its own package).

### Git hooks
- `commit-msg` only rejects commits missing a `PC-xxx` Jira key on `feature/*` branches;
  other branches (including `cursor/*`) are unaffected.
- `post-commit` runs `tsx scripts/append-requirement.ts`, which appends a row to
  `.requirements` after every commit — expect an extra unstaged `.requirements` change to
  appear after you commit.

### Tests
- Unit: `npm run test:unit` (Vitest, no server needed).
- E2E: `npm run test:e2e` (Playwright) is self-contained — it uses `file:e2e.db`, sets its
  own `AUTH_SECRET`/`E2E_TEST_MODE`, and boots its own server on port 3099. Requires
  `npx playwright install chromium` once for the Chromium binary (not part of the startup script).
  CI must **not** use `playwright install chromium --with-deps` (apt hangs on some GitHub
  ubuntu runners). Journey specs (`e2e/*journey*.spec.ts`) default to a 180s timeout.
  Production promotions require `npm run test:e2e:journeys` (see `.cursorrules`).
