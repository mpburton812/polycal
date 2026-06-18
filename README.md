# polycal

Polyamory Group Scheduling App

## Requirements workflow

PolyCal uses a **Jira-first, git-audited** workflow:

1. **Plan** — Epic + `PC-xxx` tickets in [Jira](https://mpburton.atlassian.net/jira/software/projects/PC/boards/7)
2. **Build** — `feature/*` branches; every commit includes `PC-xxx`
3. **Log** — `.requirements` append-only delivery log (automatic via git hooks)
4. **Merge** — CI validates keys; merge to `dev` transitions tickets to Done

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
```

## Commands

```bash
npm run requirements:validate
npm run requirements:append
npm run audit:check
npm run jira:keys -- --range origin/dev...HEAD
npm run jira:sync-merge -- --range origin/dev...HEAD
```

## Docs

- [Requirements workflow](docs/REQUIREMENTS-WORKFLOW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](CHANGELOG.md)
