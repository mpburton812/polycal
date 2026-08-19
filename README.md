# polycal

Polyamory Group Scheduling App

## Requirements workflow

PolyCal uses a **Jira-first, git-audited** workflow:

1. **Plan** — Epic + `PC-xxx` tickets in [Jira](https://mpburton.atlassian.net/jira/software/projects/PC/boards/7)
2. **Build** — `feature/*` branches; every commit includes `PC-xxx`
3. **Log** — `.requirements` append-only delivery log (automatic via git hooks)
4. **Merge** — PR to `dev` on GitHub; CI validates; merge triggers **Done**

**Promoting to dev:** [docs/DEV-PROMOTION.md](docs/DEV-PROMOTION.md) — always use `gh pr create --base dev`, never direct push.

**Full documentation:** [docs/REQUIREMENTS-WORKFLOW.md](docs/REQUIREMENTS-WORKFLOW.md)

**Submitting requirements:** use [docs/requirements-intake-template.md](docs/requirements-intake-template.md)

## Quick reference

| Step | What happens |
|------|----------------|
| Plan | Create Jira tickets in project **PC** |
| Commit | On `feature/*` branches, include `PC-123` in every commit message |
| Hook | `commit-msg` rejects commits missing a Jira key |
| Log | `post-commit` appends a row to `.requirements` automatically |
| CI | GitLab CI + GitHub Actions validate all commits in a PR/push |
| Merge | Push to `dev` syncs ticket status to Done (when Jira secrets configured) |

**Commit message example:**

```
feat(calendar): add weekly view PC-42
```

**Log format** (see `.requirements` header):

```
YYYY-MM-DD | <sha> | PC-123 | <summary> | <module path>
```

## Setup

```bash
npm install   # installs husky hooks via prepare script
cp .env.example .env.local
# Set AUTH_SECRET (e.g. openssl rand -base64 32)
npm run dev
```

**Non-production login (after seed):**

| Environment | Login | Password |
|-------------|-------|----------|
| Dev / feature / local E2E | `luke` | `ChangeMe123!` |
| Test (`polycal-test`) | `mpburton` | `password` |

```bash
npm run db:seed          # optional manual re-seed on empty local/dev database
npm run test:env:test    # reset + validate polycal-test Turso + Vercel connectivity
```

## Commands

```bash
npm run test:promote    # audit + Vitest — same local gate as merge-feature (minus Jira/push)
npm run test:unit       # Vitest — pure logic in src/**/*.test.ts
npm run test:unit:watch # Vitest watch mode while developing
npm run test:e2e        # Playwright E2E (full e2e/ suite; CI parity)
npm run test:env:test
npm run test:connectivity
npm run requirements:validate
npm run requirements:append
npm run audit:check
npm run merge-feature
npm run jira:keys -- --range origin/dev...HEAD
npm run jira:sync-merge -- --range origin/dev...HEAD
```

## Docs

- [Requirements workflow](docs/REQUIREMENTS-WORKFLOW.md)
- [Dev promotion (PR required)](docs/DEV-PROMOTION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](CHANGELOG.md)
- [Android compose widgets (sideload)](android-widgets/README.md)

## Reuse this workflow (template)

The portable **workflow starter** lives in [`template/`](template/README.md). Bootstrap a new project:

```powershell
npx tsx template/bootstrap.ts `
  --target "C:\Dev\my-new-app" `
  --name "My New App" `
  --slug my-new-app `
  --jira-key MA `
  --jira-url https://your-org.atlassian.net `
  --init-git
```

Or zip and copy: `workflow-starter-template.zip` at repo root (regenerate with `Compress-Archive -Path template -DestinationPath workflow-starter-template.zip`).
