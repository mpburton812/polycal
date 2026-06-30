# Promotion CI timings (PC-72)

Wall-clock reference for Playwright-heavy promotion steps. Shard times are per-matrix-job duration, not cumulative.

## Comparison table

| Step | Reference (prior runs) | This run (PC-72) |
|------|------------------------|------------------|
| feature → dev CI, 4 E2E shards (PR #120) | ~4–13 min / shard | — |
| feature → dev CI, 4 E2E shards (PR #123, PC-72) | — | 4m20s–8m45s / shard (run 28445588442) |
| dev → test CI, 4 E2E shards (PR #121) | ~4–7 min / shard | TBD (PR #124) |
| test → prod full E2E (PR #122, pre-shard) | ~19 min single job | TBD (4 shards in `production.yml`) |
| dev → test pre-shard (PR #117 / #119) | ~23–25 min single job | — |
| Local full E2E serial (`npm run test:e2e`) | ~24 min | TBD |
| Local targeted new journeys (2 specs) | — | ~3.4 min (birthday ~2.3m + weekend ~1.1m) |
| `npm run test:unit` | — | ~1.2 s |

## Notes

- E2E CI uses `npm run test:e2e:ci` with `--shard=N/4` (`e2e.yml`, `production.yml`).
- `e2e.yml` adds `concurrency` with `cancel-in-progress` to dedupe feature-push + PR runs.
- Update the **This run** column after merge using `gh pr checks` and `gh run list --workflow=e2e.yml`.
