## Summary

<!-- What this PR promotes from feature/* to dev -->

## Jira

<!-- PC-xxx tickets included in this promotion -->

## Test plan

- [ ] CI passed (`validate-jira-commits`, `npm-audit`, `vitest`, `playwright`)
- [ ] `npm audit` clean locally
- [ ] Jira tickets moved to In Review (automatic on PR open)
- [ ] User journey tests — **only if promotion request included `user test`** (dev/test) or **required** (production PR)

## Promotion checklist

- [ ] All commits reference `PC-xxx`
- [ ] `.requirements` log is up to date
- [ ] No secrets or `.env` files committed
