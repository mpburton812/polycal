#!/usr/bin/env sh
# Transition PC-xxx tickets to In Review for PRs/MRs targeting dev.
set -eu

TARGET_BRANCH="${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-${GITHUB_BASE_REF:-}}"

if [ "$TARGET_BRANCH" != "dev" ]; then
  echo "[ci] Jira In Review sync only runs for PRs/MRs targeting dev (current: ${TARGET_BRANCH:-unknown}); skipping."
  exit 0
fi

git fetch origin dev 2>/dev/null || git fetch origin "${TARGET_BRANCH}"
RANGE="origin/${TARGET_BRANCH}...HEAD"

echo "[ci] Ensuring Jira backlog gap tickets PC-52..PC-56 exist"
npx tsx scripts/backfill-jira-kanban-gap.ts

echo "[ci] Jira In Review sync for range: ${RANGE}"
npx tsx scripts/jira-transition-issues.ts --range "${RANGE}" --status "In Review"
