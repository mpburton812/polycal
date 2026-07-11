# E2E parallel journey assessment (PC-72)

Playwright config (`playwright.config.ts`): projects `chromium-safe` (SAFE_PARALLEL, `workers` = `E2E_PARALLEL_WORKERS`, default 2) and `chromium-serial` (`workers: 1`). Each worker uses `file:e2e-w{N}.db` on port `3099+N` (PC-176). Auth setup saves JWT `storageState` per origin (PC-175).

**Projects:** `chromium` (desktop) runs the full suite; `mobile-chrome` (Pixel 5) runs `mobile-smoke.spec.ts` only (PC-92).

## Journey inventory

| Spec | Primary users | Burton-Thompson overlay | Classification | CI shard safe |
|------|---------------|----------------------|----------------|---------------|
| `admin-bad-user-journey.spec.ts` | luke, bad_user | No | SERIAL_ONLY (mutates bad_user lifecycle) | Yes |
| `admin-code-status-journey.spec.ts` | luke | No | SAFE_PARALLEL (read-only Code Status panel) | Yes |
| `alert-prefs-journey.spec.ts` | leia | No | SAFE_PARALLEL | Yes |
| `batch-sleeping-journey.spec.ts` | han | No | SAFE_PARALLEL | Yes |
| `batch-sleeping-partners-journey.spec.ts` | katie, michael (BT) | **Yes** | SAFE_PARALLEL | Yes |
| `birthday-party-journey.spec.ts` | luke + 7 invitees | No | SERIAL_ONLY (long multi-user, same seed users) | Yes |
| `death-star-poll-journey.spec.ts` | han, leia, luke | No | SERIAL_ONLY (file-level `beforeAll` reset + serial phases) | Yes |
| `event-reminder-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `group-name-proposal-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `multi-day-event-slice-journey.spec.ts` | luke, leia | No | SAFE_PARALLEL | Yes |
| `proposals-attendee-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `proposals-solo-comment-journey.spec.ts` | luke, han | No | SAFE_PARALLEL | Yes |
| `proposals-week-network-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `recurrence-slice-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `residency-proposal-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `sleeping-event-conflict-journey.spec.ts` | luke, leia | No | SAFE_PARALLEL | Yes |
| `sleeping-partner-weekend-journey.spec.ts` | luke, leia | No | SERIAL_ONLY | Yes |
| `sleeping-partnership-journey.spec.ts` | han, chewie, anakin | No | SERIAL_ONLY | Yes |

**Non-journey specs** (regression): `schedule.spec.ts`, `proposals-voting.spec.ts`, `privacy-masking.spec.ts`, `onboarding.spec.ts`, etc. — see `e2e/` directory.

**Mobile smoke:** `mobile-smoke.spec.ts` — bottom nav, schedule month toggle, proposals tab (Pixel 5 project).

## Classification notes

- **SAFE_PARALLEL**: Uses `_freshDb` per test, touches few shared seed users, or only reads state it creates in-isolation.
- **SERIAL_ONLY**: Multi-step flows that reuse the same Star Wars personas (`luke`, `leia`, `han`, etc.) in one long test. Safe across *files* when each file resets the DB, but **not** safe with `workers > 1` inside a file or when two specs run concurrently against one DB.
- **CI_SHARD_SAFE**: All listed journeys are shard-safe today because each shard runs disjoint spec files against isolated CI runners (fresh `e2e.db` per job). Sharding does not split a single spec across shards.

## Recommendations

| Subset | Suggested parallelism | Rationale |
|--------|----------------------|-----------|
| SAFE_PARALLEL specs | `workers: 2–4` locally | Independent `_freshDb`; low cross-user contention |
| SERIAL_ONLY specs | Keep `workers: 1` per process | Same users in long flows; avoid intra-worker races |
| Full `e2e/*journey*.spec.ts` suite | 4-shard CI matrix (current) | Best wall-clock; each shard owns whole spec files |
| `death-star-poll-journey` | Never split phases across workers | Uses module-level `pollTitle` + `test.describe.configure({ mode: "serial" })` |
| `mobile-smoke.spec.ts` | `mobile-chrome` project only | Validates responsive shell without duplicating desktop suite |

Burton-Thompson overlay (`e2e-burton-thompson-overlay.ts`) adds Katie/Michael users and places on top of Star Wars seed; only `batch-sleeping-partners-journey` depends on it.

---

## Appendix — E2E gap matrix (assessment PC-85)

Jira epic **PC-85** tracks uncovered user journeys. Map to `user stories.txt` / launch requirements as stories are implemented.

| Jira | Requirement gap | Target spec | Status |
|------|-----------------|-------------|--------|
| PC-86 | Impersonation (dev bar + admin) | `impersonation-journey.spec.ts` | **Gap** |
| PC-87 | Passive user create + activation | `passive-user-journey.spec.ts` | **Gap** |
| PC-88 | In-flight overlap + Revoke Acceptance | `overlap-revoke-journey.spec.ts` | **Gap** |
| PC-89 | Collision auto-decline on resolve | `collision-auto-decline-journey.spec.ts` | **Gap** |
| PC-90 | Post-resolution removal → at-risk | `post-resolution-removal-journey.spec.ts` | **Gap** |
| PC-91 | Notification inbox delete/clear/actions | extend `helpers/notifications.ts` | **Gap** |
| PC-92 | Mobile viewport smoke | `mobile-smoke.spec.ts` | **Covered** |
| PC-93 | Empty states (new user) | dedicated empty-state spec | **Gap** |
| PC-94 | At-risk / proposed TTL / archival | cron + UI journey | **Partial** (`event-reminder-journey` pattern) |
| PC-95 | Super Private masking | extend `privacy-masking.spec.ts` | **Gap** |

### Covered well (baseline)

Login/session, kanban proposals, poll redraft, sleeping batch/partnerships, residency, group rename, admin pause/delete, provisioned onboarding, in-app notification read, schedule week/month/slices, private masking, event reminders, multi-day slices, recurrence slices, admin code status.

### Helpers

- `e2e/helpers/notifications.ts` — `expectInAppNotification`; `expectNotificationBadge` exists but is **unused** (PC-91).
