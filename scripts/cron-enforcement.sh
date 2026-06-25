#!/usr/bin/env bash
# PC-51: Invoke PolyCal proposal enforcement on Vercel via scheduled Render cron.
set -euo pipefail

if [[ -z "${APP_URL:-}" ]]; then
  echo "ERROR: APP_URL is not set" >&2
  exit 1
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "ERROR: CRON_SECRET is not set" >&2
  exit 1
fi

curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" "${APP_URL}/api/cron/enforcement"
