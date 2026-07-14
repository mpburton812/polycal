# E2E parallel journey assessment (PC-72 / PC-213 / PC-214)

Playwright config (`playwright.config.ts`): projects `chromium-safe` (SAFE_PARALLEL, `workers` = `E2E_PARALLEL_WORKERS`, default 2), `chromium-serial` (`workers: 1`), and `mobile-chrome` on a **dedicated** DB/port (never shares serial w0).

| Env | Effect |
|-----|--------|
| `E2E_PARALLEL_WORKERS` | SAFE workers (default **2**, max 4). `0`/`1` → single shared w0 for serial+SAFE with SAFE **depending on** serial. |
| `E2E_INCLUDE_MOBILE=0` | Skip mobile server/project (journey-only local runs). |
| `E2E_REUSE_SERVER=1` | Allow Playwright `reuseExistingServer` (opt-in; default **off** so stale local Next processes are never reused). |

**Topology (default workers=2):** w0 serial · w1–w2 SAFE · w3 mobile. Auth setup writes `e2e/.auth/luke-w{N}.json` for each.

## Commands

| Script | Purpose |
|--------|---------|
| `npm run test:e2e` | Full suite (prepare + all projects) |
| `npm run test:e2e:journeys` | Journey specs only; mobile server omitted |
| `npm run test:e2e:cleanup` | Unlink `e2e-w*.db` (+ wal/shm) and free ports `3099+` |
| `npm run test:e2e:report` | Open last HTML report |

After a crashed multi-server run on Windows: `npm run test:e2e:cleanup` then re-prepare.

## Fixture rules

- Prefer `import { test, expect } from "./helpers/test"` — auto `_freshDb` + worker `baseURL`/storage.
- Serial multi-phase files that must preserve DB across tests: `testManualDb` + `beforeAll(resetE2eDatabase)` (e.g. `death-star-poll-journey`, `event-schedule-views-journey`).
- Public auth flows: `test.use({ storageState: emptyStorageState })`.

## Journey inventory

Source of truth for SAFE list: `SAFE_PARALLEL_SPECS` in [`e2e/parallel.ts`](../e2e/parallel.ts).

| Spec | Primary users | Burton-Thompson overlay | Classification | CI shard safe |
|------|---------------|----------------------|----------------|---------------|
| `admin-bad-user-journey.spec.ts` | luke, bad_user | No | SERIAL_ONLY | Yes |
| `admin-code-status-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `alert-prefs-journey.spec.ts` | leia | No | SAFE_PARALLEL | Yes |
| `batch-sleeping-journey.spec.ts` | han | No | SAFE_PARALLEL | Yes |
| `batch-sleeping-partners-journey.spec.ts` | katie, michael (BT) | **Yes** | SAFE_PARALLEL | Yes |
| `birthday-party-journey.spec.ts` | luke + 7 invitees | No | SERIAL_ONLY | Yes |
| `dates-times-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `death-star-poll-journey.spec.ts` | han, leia, luke | No | SERIAL_ONLY (`testManualDb`) | Yes |
| `event-reminder-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `event-schedule-views-journey.spec.ts` | luke, leia | No | SERIAL_ONLY (`testManualDb`, file-level reset) | Yes |
| `group-name-proposal-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `impersonation-journey.spec.ts` | luke / admin | No | SERIAL_ONLY | Yes |
| `multi-day-event-slice-journey.spec.ts` | luke, leia | No | SAFE_PARALLEL | Yes |
| `notification-inbox-journey.spec.ts` | luke | No | SERIAL_ONLY | Yes |
| `overlap-revoke-journey.spec.ts` | luke, leia | No | SERIAL_ONLY | Yes |
| `passive-user-journey.spec.ts` | admin + passive | No | SERIAL_ONLY | Yes |
| `password-reset-journey.spec.ts` | luke | No | SERIAL_ONLY (empty storage) | Yes |
| `proposals-attendee-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `proposals-solo-comment-journey.spec.ts` | luke, han | No | SAFE_PARALLEL | Yes |
| `proposals-week-network-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `recurrence-slice-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `residency-proposal-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `sleeping-event-conflict-journey.spec.ts` | luke, leia | No | SAFE_PARALLEL | Yes |
| `sleeping-partner-weekend-journey.spec.ts` | luke, leia | No | SERIAL_ONLY | Yes |
| `sleeping-partnership-journey.spec.ts` | han, chewie, anakin | No | SERIAL_ONLY | Yes |

**Mobile smoke:** `mobile-smoke.spec.ts` — own DB index (`mobileDbIndex()`), Pixel 5 project.

## Classification notes

- **SAFE_PARALLEL**: Uses `_freshDb` per test (or creates isolated data); listed in `SAFE_PARALLEL_SPECS`.
- **SERIAL_ONLY**: Multi-step / shared-persona flows — `chromium-serial`, workers=1.
- **CI**: 5 shards × `E2E_PARALLEL_WORKERS=2`; each shard still boots the full server topology for that env.

## Flake classes (monitor)

1. Shared-w0 races (mitigated: mobile dedicated; workers=1 serializes SAFE after serial).
2. Stale `reuseExistingServer` / port conflict (mitigated: reuse opt-in + `test:e2e:cleanup`).
3. Multi-`next start` process death (labeled by `scripts/e2e-serve.ts`).
4. Missing worker fixtures (raw `@playwright/test` imports — prefer helpers).

Burton-Thompson overlay (`e2e-burton-thompson-overlay.ts`) adds Katie/Michael users and places on top of Star Wars seed; only `batch-sleeping-partners-journey` depends on it.

---

## Appendix — E2E gap matrix (assessment PC-85)

Jira epic **PC-85** tracks uncovered user journeys. Map to `user stories.txt` / launch requirements as stories are implemented.

| Jira | Requirement gap | Target spec | Status |
|------|-----------------|-------------|--------|
| PC-86 | Impersonation (dev bar + admin) | `impersonation-journey.spec.ts` | Covered / track status in Jira |
| PC-87 | Passive user create + activation | `passive-user-journey.spec.ts` | Covered / track status in Jira |
| PC-88 | In-flight overlap + Revoke Acceptance | `overlap-revoke-journey.spec.ts` | Covered / track status in Jira |
| PC-91 | Notification inbox delete/clear/actions | `notification-inbox-journey.spec.ts` | Covered / track status in Jira |
| PC-92 | Mobile viewport smoke | `mobile-smoke.spec.ts` | **Covered** |

### Helpers

- `e2e/helpers/notifications.ts` — `expectInAppNotification`
- `e2e/helpers/test.ts` — `test` (auto reset) / `testManualDb` (file-level)
