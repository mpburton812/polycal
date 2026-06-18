# Promoting to `dev`

All promotion from `feature/*` to `dev` **must use a GitHub Pull Request**. Direct pushes or local merges to `dev` are not allowed.

## Why PRs are required

- Triggers **In Review** Jira sync (`jira-sync-on-pr`)
- Runs CI gates (`validate-jira-commits`, `npm-audit`) before merge
- Triggers **Done** Jira sync on merge (`jira-sync-on-merge`)
- Provides an audit trail in GitHub

## Agent / developer workflow

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
