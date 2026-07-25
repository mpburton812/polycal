#!/usr/bin/env sh
# Shared CI entrypoint for Jira key validation on feature branches.
set -eu

BRANCH="${CI_COMMIT_REF_NAME:-${GITHUB_HEAD_REF:-$(git rev-parse --abbrev-ref HEAD)}}"

if [ -n "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-}" ]; then
  RANGE="origin/${CI_MERGE_REQUEST_TARGET_BRANCH_NAME}...HEAD"
elif [ -n "${GITHUB_BASE_REF:-}" ]; then
  git fetch origin "${GITHUB_BASE_REF}"
  RANGE="origin/${GITHUB_BASE_REF}...HEAD"
elif [ -n "${CI_COMMIT_BEFORE_SHA:-}" ] && [ "${CI_COMMIT_BEFORE_SHA}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${CI_COMMIT_BEFORE_SHA}..${CI_COMMIT_SHA}"
elif [ -n "${GITHUB_EVENT_BEFORE:-}" ] && [ "${GITHUB_EVENT_BEFORE}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${GITHUB_EVENT_BEFORE}..${GITHUB_SHA}"
else
  RANGE="HEAD~1..HEAD"
fi

# Force-pushes rewrite history so GITHUB_EVENT_BEFORE may no longer resolve.
# Fall back to the PR base (or last commit) so validation still runs (PC-356).
if ! git rev-list --no-merges "${RANGE}" >/dev/null 2>&1; then
  if [ -n "${GITHUB_BASE_REF:-}" ]; then
    git fetch origin "${GITHUB_BASE_REF}" >/dev/null 2>&1 || true
    RANGE="origin/${GITHUB_BASE_REF}...HEAD"
  elif git rev-parse --verify origin/dev >/dev/null 2>&1; then
    RANGE="origin/dev...HEAD"
  else
    RANGE="HEAD~1..HEAD"
  fi
  echo "[ci] Invalid push range; falling back to: ${RANGE}"
fi

echo "[ci] Validating Jira keys for range: ${RANGE} (branch: ${BRANCH})"
npx tsx scripts/validate-jira-commits.ts --range "${RANGE}" --branch "${BRANCH}"
