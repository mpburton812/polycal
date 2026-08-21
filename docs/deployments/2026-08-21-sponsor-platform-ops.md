# Sponsor platform ops — production deployment

**Date:** 2026-08-21 (UTC)  
**Change control:** `2026.08.20a`  
**Epic:** [PC-459](https://polycal.atlassian.net/browse/PC-459)  
**Stories:** PC-460–PC-466  
**Production merge:** [PR #441](https://github.com/mpburton812/polycal/pull/441) at 07:19 UTC (`5120d5478471ff3b6195518db2c70cb302b4beea`)  
**Vercel production:** [dpl_2SqayMJz5wWhbHfrtf1o3nM1w7z6](https://vercel.com/michael-burton-s-projects/polycal/2SqayMJz5wWhbHfrtf1o3nM1w7z6) READY @ `5120d54`  
**Duration:** tracker start 01:21 UTC → merge 07:19 UTC (**5h 58m**)

## What shipped

| Ticket | Theme | Behavior |
| --- | --- | --- |
| PC-460 | Sponsor role | SCHEMA_VERSION 52. One Sponsor per network; sticky chip; cannot be demoted or removed. Elevation gates; inhabit/update refusals. |
| PC-461 | Autosave settings | Network Configuration patches on toggle/blur. Toast + revert. Save button removed. |
| PC-462 | Network close | Sponsor DELETE starts a 24h `pending_delete` lock. T-1h email (email only). Cron hard-wipe keeps user accounts and denormalized `platform_system_log.networkName`. |
| PC-463 | Logs and alerts | Network Administrator Log rename. `platform_system_log` plus operator alert queue (not MOTD). |
| PC-464 | About | Profile About: Privacy, Terms, support message that bold-alerts platform admins. Existing Feedback menu kept. |
| PC-465 | Email login | Magic link on `/login`. Full session; no `mustChangePassword`; existing password stays valid. |
| PC-466 | App icon | PWA and apple PNGs generated from `assets/images/icon.webp`. |

## Promotion path

| PR | Leg | Merged (UTC) | SHA |
| --- | --- | --- | --- |
| [#437](https://github.com/mpburton812/polycal/pull/437) | feature → `dev` | 04:39 | `fe0e670a20becf3cdc5b06a7411a341499a8ba97` |
| [#438](https://github.com/mpburton812/polycal/pull/438) | `dev` → `test` | 04:59 | `cec7f42d022379d644ee477ca9a3e1fce8c07277` |
| [#439](https://github.com/mpburton812/polycal/pull/439) | e2e overlay follow-up → `dev` | 06:31 | `8358c45a2da200367b8426ccf2d4029da016aaf9` |
| [#440](https://github.com/mpburton812/polycal/pull/440) | e2e overlay follow-up → `test` | 06:55 | `ee3ae056a294f231795c4283c21d64cf3af57272` |
| [#441](https://github.com/mpburton812/polycal/pull/441) | `test` → `production` | 07:19 | `5120d5478471ff3b6195518db2c70cb302b4beea` |

CI on #441: [run 32456535848](https://github.com/mpburton812/polycal/actions/runs/32456535848) — `audit-unit` 42s, `e2e-build` 1m43s, Playwright serial 1/3 **15m35s**, serial 2/3 **13m41s**, serial 3/3 **5m40s**, safe 1/2 **6m16s**, safe 2/2 **5m40s**. All passed.

## Gate outcomes

| Gate | Result |
| --- | --- |
| `npm audit` (feature → `dev`) | 0 vulnerabilities |
| `npm run test:unit` | 551+ passed after typecheck fixes (first local run failed on settings schema import + Windows purge file lock) |
| Local `npm run test:e2e:journeys` | First run **87 passed, 3 failed** in 57.9m. Isolated retry of those three specs **6 passed** in 3.5m. |
| CI Playwright on #441 | Green (serial 1–3, safe 1–2) |
| Vercel production | READY |

Production PR test plan classified the three local failures as: one real bug (fixed in #439, isolated retry passed) and two flakes (isolated retry passed; already green in CI e2e). The full 58m suite was not re-run after #439 (e2e-only follow-up; isolated retry of the failing spec passed).

## Testing bugs (every incident)

### CI typecheck / Next build (fixed on the feature branch before #437)

1. **`AssignableAccessLevel` included `"sponsor"`** — `setUserAccessLevelAction` only accepts `platform_admin | admin | user`. Fix: `Exclude<AccountAccessLevel, "passive" | "sponsor">` in `PlatformAdminClient.tsx` and `AdminUserManagementPanel.tsx`. List platform users with `networkRole` so Sponsor chips resolve.
2. **`SessionUser` missing `isPlatformAdmin`** — `src/lib/actions/context.ts` and `context.test.ts`.
3. **`schedulingPosting` string vs enum** — `src/actions/network-settings.ts`.
4. **`"use server"` exported Zod object** — Next: “A use server file can only export async functions, found object.” Removed the `settingsPatchSchema` re-export from `src/actions/network-settings.ts`.

### Product / RSC (fixed before #437)

5. **Email login redeem 500** — calling `signIn` from an RSC swallowed `NEXT_REDIRECT`. Now `redeemEmailLoginAction` + auto-submit `EmailLoginRedeemForm` (`app/login/email/page.tsx`, `src/actions/email-login.ts`, `src/components/auth/EmailLoginRedeemForm.tsx`). `isNextRedirectError` in `src/lib/auth/email-login.ts`.

### E2E locators and autosave (fixed before #437)

6. **“System administrator log” → “Network Administrator Log”** — `residency-proposal-journey.spec.ts` and `impersonation-journey.spec.ts`.
7. **Autosave toast** — selecting an already-selected Event Types value does not toast. Helpers skip no-op saves. `expectToast` instead of raw `getByText`. Removed `router.refresh()` from `persistPatch` in `AdminNetworkSettingsPanel.tsx` (still used on delete/reactivate).

### Real e2e/product bug after merge to test (fixed in #439 / #440)

8. **Platform alert overlay (PC-463)** — unacked major logs (`PlatformLogAlertHost`, dialog title **“Platform alert”**) blocked Profile menu / User management. `platform-admin-access-journey` failed: row never showed “Platform Admin” after Save. Fix: `dismissPlatformLogAlertIfOpen` in `e2e/helpers/motd.ts` (from `dismissBlockingDialogsIfOpen`); idempotent `expandAdminSection`; `openProfileMenu` retries dismiss; `admin-bad-user-journey` scopes “Bad User” to a **row**; `platform-admin-access-journey` dismisses after access-level Save.

### Local flakes (isolated retry passed; already green in CI e2e)

9. **`e2e/admin-code-status-journey.spec.ts`** — “You're on the latest version for this environment.” not visible. Isolated retry passed.
10. **`e2e/batch-sleeping-partners-journey.spec.ts`** — `net::ERR_CONNECTION_REFUSED` on `/login` (webServer teardown race). Isolated retry passed.

## Residual risk

- **Hard-wipe SQL list** (`purgeNetwork`) may miss tables added later. User accounts and `platform_system_log` are intentionally kept.
- **Auth.js `NEXT_REDIRECT` swallowing** remains a standing pattern on password `signIn` catch-all. Email-login redeem no longer uses that path.
- **Operator alerts are a queue**, not MOTD. E2E and operators must dismiss them or Profile/Admin flows stall.

## Jira

CI automates In Progress / In Review / Done on feature → `dev`. This session did not have Atlassian MCP to transition PC-459–PC-466 manually.
