#!/usr/bin/env sh
# Fail when npm audit reports unresolved vulnerabilities at or above AUDIT_LEVEL.
# Used as a promotion gate for feature/* → dev merge requests and pushes.
set -eu

AUDIT_LEVEL="${NPM_AUDIT_LEVEL:-low}"

echo "[ci] Running npm audit (audit-level=${AUDIT_LEVEL})..."
npm audit --audit-level="${AUDIT_LEVEL}"

echo "[ci] npm audit passed — no unresolved vulnerabilities at or above ${AUDIT_LEVEL}."
