# Promotion CI timings (PC-72 / PC-350)

Wall-clock reference for Playwright-heavy promotion steps. Shard times are per-matrix-job duration, not cumulative.

## Comparison table

| Step | Reference (prior runs) | This run (PC-72) |
|------|------------------------|------------------|
| feature → dev CI, flat 5 E2E shards (PR feature/PC-347, run 30105399433) | serial-packed shard 1 **~21m** PW; shards 3–5 ~3–5m | — |
| feature → dev CI, suite-scoped serial×3 + safe×2 (PC-350) | — | TBD after merge (`gh run list --workflow=e2e.yml`) |
| feature → dev CI, 4 E2E shards (PR #120) | ~4–13 min / shard | — |
| feature → dev CI, 4 E2E shards (PR #123, PC-72) | — | 4m20s–8m45s / shard (run 28445588442) |
| dev → test CI, 4 E2E shards (PR #121) | ~4–7 min / shard | — |
| dev → test CI, 4 E2E shards (PR #124, PC-72) | — | 4m17s–8m52s / shard (run 28446154449) |
| test → prod full E2E (PR #122, pre-shard) | ~19 min single job | TBD (suite-scoped matrix in `production.yml`) |
| dev → test pre-shard (PR #117 / #119) | ~23–25 min single job | — |
| Local full E2E serial (`npm run test:e2e`) | ~24 min | TBD |
| Local targeted new journeys (2 specs) | — | ~3.4 min (birthday ~2.3m + weekend ~1.1m) |
| `npm run test:unit` | — | ~1.2 s |

## Notes

- E2E CI builds Next **once** (`build` / `e2e-build` job), uploads `.next`, and shards only `next start` + Playwright (PC-174).
- **PC-350:** Matrix is suite-scoped (`serial` 1–3/3 + `safe` 1–2/2 with mobile), not flat `--shard=N/5`. Flat sharding packed ~51 SERIAL_ONLY tests into jobs 1–2 (`workers: 1`) while jobs 3–5 were SAFE-only — ~7× duration skew.
- Serial jobs use `E2E_PARALLEL_WORKERS=1` and `E2E_INCLUDE_MOBILE=0` (single w0 server). Safe jobs use workers=2 and include mobile project/server.
- SAFE_PARALLEL specs run with `E2E_PARALLEL_WORKERS` (default 2) against `e2e-w{N}.db` on ports `3099+N` (PC-176); SERIAL_ONLY stays `workers: 1`.
- Auth setup writes JWT `storageState` per worker origin (PC-175); setup project is a dependency and is not part of the shard partition.
- `e2e.yml` adds `concurrency` with `cancel-in-progress` to dedupe feature-push + PR runs.
- Update timings after merge using `gh pr checks` and `gh run list --workflow=e2e.yml`. Local `--list` check: `node scripts/verify-e2e-shard-list.mjs`.
