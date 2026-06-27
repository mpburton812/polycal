#!/usr/bin/env sh
# Transition Jira PC-xxx tickets to Done for commits merged into dev.
set -eu

BRANCH="${CI_COMMIT_BRANCH:-${GITHUB_REF_NAME:-}}"

if [ "$BRANCH" != "dev" ]; then
  echo "[ci] Jira sync only runs on dev branch (current: ${BRANCH:-unknown}); skipping."
  exit 0
fi

if [ -n "${CI_COMMIT_BEFORE_SHA:-}" ] && [ "${CI_COMMIT_BEFORE_SHA}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${CI_COMMIT_BEFORE_SHA}..${CI_COMMIT_SHA}"
elif [ -n "${GITHUB_EVENT_BEFORE:-}" ] && [ "${GITHUB_EVENT_BEFORE}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${GITHUB_EVENT_BEFORE}..${GITHUB_SHA}"
else
  # First push to dev (or missing before-SHA): use all commits on dev not on main.
  git fetch origin main 2>/dev/null || true
  if git rev-parse origin/main >/dev/null 2>&1; then
    RANGE="origin/main..HEAD"
  else
    RANGE="HEAD"
  fi
  echo "[ci] Using fallback merge range: ${RANGE}"
fi

echo "[ci] Ensuring Jira backlog gap tickets PC-52..PC-56 exist"
npx tsx scripts/backfill-jira-kanban-gap.ts

echo "[ci] Jira Done sync for range: ${RANGE}"
npx tsx scripts/jira-transition-issues.ts --range "${RANGE}" --status "Done"
