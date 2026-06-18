# Promoting to `dev`

All promotion from `feature/*` to `dev` **must use a GitHub Pull Request**. Direct pushes or local merges to `dev` are not allowed.

## Why PRs are required

- Triggers **In Review** Jira sync (`jira-sync-on-pr`)
- Runs CI gates (`validate-jira-commits`, `npm-audit`) before merge
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
merge feature -Merge   # push + open PR + wait for CI + merge to dev + sync local dev
```

The shortcut runs:

1. `npm audit --audit-level=low`
2. Jira key validation (`origin/dev...HEAD`)
3. `git push -u origin HEAD`
4. `gh pr create --base dev --fill` (skips if PR already open)

With `-Merge`, also merges the PR when CI passes and runs `git checkout dev && git pull origin dev`.

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

## Do not

- `git checkout dev && git merge feature/... && git push` (bypasses PR checks and Jira In Review)
- `git push origin dev` from a feature branch

## GitHub branch protection (recommended)

Enable on the `dev` branch in GitHub repository settings:

1. **Settings → Branches → Add branch protection rule**
2. Branch name pattern: `dev`
3. Enable **Require a pull request before merging**
4. Enable **Require status checks to pass** (select `validate-jira-commits`, `npm-audit`)
5. Optionally require PR reviews

This enforces PR-only promotion at the platform level.

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
