# E2E parallel journey assessment (PC-72)

Playwright config (`playwright.config.ts`): `workers: 1`, `fullyParallel: false`. Each spec that imports `./helpers/test` gets a fresh `e2e.db` reset via the `_freshDb` fixture before the test runs.

## Journey inventory

| Spec | Primary users | Burton-Thompson overlay | Classification | CI shard safe |
|------|---------------|----------------------|----------------|---------------|
| `admin-bad-user-journey.spec.ts` | luke, bad_user | No | SERIAL_ONLY (mutates bad_user lifecycle) | Yes |
| `alert-prefs-journey.spec.ts` | leia | No | SAFE_PARALLEL | Yes |
| `batch-sleeping-journey.spec.ts` | han | No | SAFE_PARALLEL | Yes |
| `batch-sleeping-partners-journey.spec.ts` | katie, michael (BT) | **Yes** | SAFE_PARALLEL | Yes |
| `birthday-party-journey.spec.ts` | luke + 7 invitees | No | SERIAL_ONLY (long multi-user, same seed users) | Yes |
| `death-star-poll-journey.spec.ts` | han, leia, luke | No | SERIAL_ONLY (file-level `beforeAll` reset + serial phases) | Yes |
| `event-reminder-journey.spec.ts` | luke | No | SAFE_PARALLEL | Yes |
| `group-name-proposal-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `proposals-attendee-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `proposals-solo-comment-journey.spec.ts` | luke, han | No | SAFE_PARALLEL | Yes |
| `proposals-week-network-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `residency-proposal-journey.spec.ts` | luke, leia, han | No | SERIAL_ONLY | Yes |
| `sleeping-event-conflict-journey.spec.ts` | luke, leia | No | SAFE_PARALLEL | Yes |
| `sleeping-partner-weekend-journey.spec.ts` | luke, leia | No | SERIAL_ONLY | Yes |
| `sleeping-partnership-journey.spec.ts` | han, chewie, anakin | No | SERIAL_ONLY | Yes |

## Classification notes

- **SAFE_PARALLEL**: Uses `_freshDb` per test, touches few shared seed users, or only reads state it creates in-isolation.
- **SERIAL_ONLY**: Multi-step flows that reuse the same Star Wars personas (`luke`, `leia`, `han`, etc.) in one long test. Safe across *files* when each file resets the DB, but **not** safe with `workers > 1` inside a file or when two specs run concurrently against one DB.
- **CI_SHARD_SAFE**: All listed journeys are shard-safe today because each shard runs disjoint spec files against isolated CI runners (fresh `e2e.db` per job). Sharding does not split a single spec across shards.

## Recommendations

| Subset | Suggested parallelism | Rationale |
|--------|----------------------|-----------|
| SAFE_PARALLEL specs (6 files) | `workers: 2–4` locally | Independent `_freshDb`; low cross-user contention |
| SERIAL_ONLY specs (10 files) | Keep `workers: 1` per process | Same users in long flows; avoid intra-worker races |
| Full `e2e/*journey*.spec.ts` suite | 4-shard CI matrix (current) | Best wall-clock; each shard owns whole spec files |
| `death-star-poll-journey` | Never split phases across workers | Uses module-level `pollTitle` + `test.describe.configure({ mode: "serial" })` |

Burton-Thompson overlay (`e2e-burton-thompson-overlay.ts`) adds Katie/Michael users and places on top of Star Wars seed; only `batch-sleeping-partners-journey` depends on it.
