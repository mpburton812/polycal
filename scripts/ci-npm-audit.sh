#!/usr/bin/env sh
# Fail when npm audit reports unresolved vulnerabilities at or above AUDIT_LEVEL.
# Used as a promotion gate for feature/* → dev merge requests and pushes.
set -eu

echo "[ci] Running npm audit with documented dev-only allowlist..."
node scripts/audit-allowlist.mjs
echo "[ci] npm audit passed."
