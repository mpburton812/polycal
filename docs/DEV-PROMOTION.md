# Promoting to `dev`

All promotion from `feature/*` to `dev` **must use a GitHub Pull Request**. Direct pushes or local merges to `dev` are not allowed.

## Why PRs are required

- Triggers **In Review** Jira sync (`jira-sync-on-pr`)
- Runs CI gates (`validate-jira-commits`, `npm-audit`, `vitest`, `playwright`) before merge
- Triggers **Done** Jira sync on merge (`jira-sync-on-merge`)
- Provides an audit trail in GitHub

## Agent / developer workflow

### Shortcut: `merge feature` (recommended)

From the repo root:

```bash
npm run merge-feature
```

Or install the PowerShell shortcut once (see below), then from any directory:

```powershell
merge feature          # push + open PR to dev
merge feature -Merge   # push + open PR + wait for CI + merge to dev
```

The shortcut runs:

1. `npm audit --audit-level=low`
2. `npm run test:unit` (Vitest)
3. Jira key validation (`origin/dev...HEAD`)
4. `git push -u origin HEAD`
5. `gh pr create --base dev --fill` (skips if PR already open)

### Manual steps

```bash
# 1. Finish work on feature branch
git checkout feature/your-branch
git push -u origin HEAD

# 2. Open PR to dev (required — do not skip)
gh pr create --base dev --title "feat(scope): summary PC-xxx" --body "$(cat <<'EOF'
## Summary
- ...

## Jira
- PC-xxx

## Test plan
- [ ] CI green
EOF
)"

# 3. After CI passes, merge the PR (squash or merge commit per team preference)
gh pr merge --merge   # or --squash
```

## Change control log (required on every promotion)

Every time code is promoted to an environment (`feature` → `dev`, `dev` → `test`,
`test` → `production`), add a new entry to the change control log describing what
changed in that version:

1. Prepend a new `ChangelogEntry` (newest first) to `src/lib/changelog/entries.ts`
   with a date-based `version`, the promotion `date`, a one-line `summary`, and the
   list of `changes` (`added` / `changed` / `fixed`).
2. Mirror the human-readable summary in `CHANGELOG.md`.

The in-app **Admin → Code Status** panel reads `src/lib/changelog/entries.ts`,
shows the live build number and when it went live, surfaces the most recent entry,
and exposes the full log via the build-number link. This keeps the deployed change
history visible per environment.

## Do not

- `git checkout dev && git merge feature/... && git push` (bypasses PR checks and Jira In Review)
- `git push origin dev` from a feature branch
- Promote without adding a change control log entry (see above)

## GitHub branch protection (recommended)

Enable on the `dev` branch in GitHub repository settings:

1. **Settings → Branches → Add branch protection rule**
2. Branch name pattern: `dev`
3. Enable **Require a pull request before merging**
4. Enable **Require status checks to pass** (select `validate-jira-commits`, `npm-audit`, `vitest`, `playwright`)
5. Optionally require PR reviews

This enforces PR-only promotion at the platform level.

## User journey testing policy

**User journeys** are multi-step Playwright specs (`e2e/*journey*.spec.ts`) and manual browser verification of realistic end-user paths. They are **not** the same as Vitest unit tests.

| Promotion | Default agent gates | User journey tests |
|-----------|---------------------|-------------------|
| `feature` → `dev` | `npm audit`, Vitest, green CI | **Optional** — only when the request includes **`user test`** |
| `dev` → `test` | Green CI on promotion PR | **Optional** — only when the request includes **`user test`** |
| `test` → `production` | Full CI chain | **Mandatory** — run before opening or merging the production PR |

Before production promotion, complete [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md) and document user journey pass status in the PR test plan.

Examples:

```text
commit and push to dev          → no user journey run required
user test: promote to test      → run user journey specs before merge
promote test to production      → user journeys mandatory
```

Run user journeys locally:

```bash
npm run test:e2e                              # full e2e/ suite (CI parity)
npx playwright test e2e/*journey*.spec.ts   # journey specs only (after e2e prepare)
```

CI still runs the full Playwright job (`.github/workflows/e2e.yml`) on PRs to `dev` and `test` as an automated safety net.

## Install the `merge feature` PowerShell shortcut

Run once in PowerShell (updates your profile):

```powershell
$repo = "C:\Dev\2026-06-18 polycal"
$block = @"

# PolyCal: promote feature/* to dev via GitHub PR
function merge {
  param(
    [Parameter(Position = 0, Mandatory = `$true)][string]`$Target,
    [switch]`$Merge
  )
  if (`$Target -ne 'feature') {
    Write-Error "Usage: merge feature [-Merge]"
    return
  }
  if (`$Merge) {
    & "$repo\scripts\merge-feature.ps1" -Merge
  } else {
    & "$repo\scripts\merge-feature.ps1"
  }
}
function merge-feature {
  param([switch]`$Merge)
  if (`$Merge) {
    & "$repo\scripts\merge-feature.ps1" -Merge
  } else {
    & "$repo\scripts\merge-feature.ps1"
  }
}
"@

if (-not (Test-Path $PROFILE)) { New-Item -Path $PROFILE -ItemType File -Force | Out-Null }
if (-not (Select-String -Path $PROFILE -Pattern 'PolyCal: promote feature' -Quiet)) {
  Add-Content -Path $PROFILE -Value $block
  Write-Host "Added merge feature shortcut to $PROFILE"
} else {
  Write-Host "Shortcut already installed in $PROFILE"
}
```

Restart your terminal, then use:

```powershell
merge feature
```
