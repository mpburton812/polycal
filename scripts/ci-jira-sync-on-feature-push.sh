#!/usr/bin/env sh
# Transition PC-xxx tickets to In Progress for commits pushed to feature/*.
set -eu

BRANCH="${CI_COMMIT_BRANCH:-${GITHUB_REF_NAME:-}}"

case "$BRANCH" in
  feature/*) ;;
  *)
    echo "[ci] Jira In Progress sync only runs on feature/* (current: ${BRANCH:-unknown}); skipping."
    exit 0
    ;;
esac

if [ -n "${CI_COMMIT_BEFORE_SHA:-}" ] && [ "${CI_COMMIT_BEFORE_SHA}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${CI_COMMIT_BEFORE_SHA}..${CI_COMMIT_SHA}"
elif [ -n "${GITHUB_EVENT_BEFORE:-}" ] && [ "${GITHUB_EVENT_BEFORE}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${GITHUB_EVENT_BEFORE}..${GITHUB_SHA}"
else
  RANGE="HEAD~1..HEAD"
fi

echo "[ci] Ensuring Jira backlog gap tickets PC-52..PC-56 exist"
npx tsx scripts/backfill-jira-kanban-gap.ts || echo "[ci] Jira gap backfill skipped or failed; continuing to status sync."

echo "[ci] Jira In Progress sync for range: ${RANGE}"
npx tsx scripts/jira-transition-issues.ts --range "${RANGE}" --status "In Progress"
