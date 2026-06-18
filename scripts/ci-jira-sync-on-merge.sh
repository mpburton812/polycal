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
  echo "[ci] Cannot determine merge range for Jira sync; skipping."
  exit 0
fi

echo "[ci] Jira sync for range: ${RANGE}"
npx tsx scripts/jira-transition-on-merge.ts --range "${RANGE}"
