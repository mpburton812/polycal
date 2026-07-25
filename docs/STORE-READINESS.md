# Store readiness — distribution path and compliance checklist

Tracks what PolyCal must satisfy to be distributed to end users. Epic **PC-352**; Phase 1
(web/PWA compliance) is **PC-354**.

## Distribution decision

**PolyCal ships as an installable web app (PWA).** There is one Next.js service; users
install it from the browser ("Add to Home Screen" / "Install app"), and it runs
standalone from the web manifest with a service worker for offline shell and push.

**Deferred: native wrappers.** Capacitor (iOS/Android app-store binaries) and TWA
(Trusted Web Activity for Google Play) are **not** in scope for Phase 1. They are viable
later because the app is already a compliant PWA, but each adds a store account, review
cycle, signing infrastructure, and release process that the current alpha group does not
need. Revisit when the product needs push on iOS Safari older than 16.4, deep OS
integration, or store discovery.

Consequences of the web/PWA path:

- No app-store review gate, but the same substantive requirements still apply — a public
  privacy policy, public terms, self-service deletion, and data export are expected by
  Google OAuth verification and by GDPR/CCPA-style data-subject rights.
- Updates ship instantly on deploy; there is no store rollout or forced-update mechanism.
- Age gating is contractual (Terms §1) rather than enforced by a store age rating.

## Phase 1 compliance checklist (PC-354)

### Public documents

- [x] Privacy policy at `/privacy`, reachable without authentication (allowlisted in
      `middleware.ts`)
- [x] Terms of service at `/terms`, reachable without authentication
- [x] Both linked from the landing page (`app/page.tsx`), Profile & Settings footer, and
      the first-login wizard consent line
- [x] Privacy §8 describes self-service deletion, what is erased, what is retained, and
      why — not "contact an administrator"

### Data subject rights

- [x] **Self-service deletion** — `deleteMyAccountAction` (`src/actions/users.ts`),
      surfaced in Profile & Settings → Your data. Requires the current password *and* a
      typed confirmation phrase. Unavailable while an admin is impersonating.
- [x] Deletion purges profile fields, avatar image (`stored_images`), bio, gender,
      notification/feed preference JSON, notification email and verification state,
      outstanding reset/verification tokens, push subscriptions, and the calendar
      connection (with Google token revocation); it archives authored proposals, removes
      places and partnership/residency edges, and bumps `sessionVersion`.
- [x] Deletion is blocked for the last active administrator so the group cannot be locked
      out of account management.
- [x] Admin delete (`deleteUserAction`) runs the identical erasure path (`eraseAccount`).
- [x] **Data export** — `exportMyDataAction` (`src/actions/account.ts`) returns JSON with
      profile, preferences, authored proposal summary, and partnership summary. Excludes
      password hashes, link tokens, and encrypted calendar tokens.

### PWA requirements

- [x] `app/manifest.ts` declares `id`, `scope`, `start_url`, `display: standalone`,
      `categories`, and theme/background colors from the garden tokens
- [x] Maskable icon (`/icons/icon-maskable-512.png`, artwork inside the 80% safe zone)
      alongside the `any`-purpose 192/512 icons
- [x] `apple-touch-icon` (180×180, flattened background) and `appleWebApp` metadata in
      `app/layout.tsx`
- [x] Service worker navigation fallback to `/offline` for document requests (`src/sw.ts`)
- [x] `theme_color` aligned with `GARDEN_TOKENS.sage`; `background_color` with
      `GARDEN_TOKENS.background`

### Content rating

- [x] Terms §1 states an 18+ eligibility requirement and notes the mature (**17+**)
      rating the product would carry in a store context, driven by adult relationship
      content (sleeping arrangements, partner relationships).
- [ ] If native distribution is revived, file the questionnaires accordingly:
      **Apple 17+** (Infrequent/Mild Sexual Content and Nudity, Mature/Suggestive Themes)
      and **Google Play "Mature 17+"** via the IARC questionnaire.

## Deferred — native wrapper prerequisites

Only relevant if Capacitor or TWA is revisited. None are Phase 1 blockers.

- [ ] Apple Developer Program membership; Google Play developer account
- [ ] App-store privacy nutrition labels / Play Data safety form (must match `/privacy`)
- [ ] Account deletion reachable **inside the app** and, for iOS, an additional
      web-accessible deletion URL (App Store Review Guideline 5.1.1(v)) — the current
      Profile & Settings flow already satisfies the in-app half
- [ ] Signing keys and CI release pipeline; TWA Digital Asset Links (`assetlinks.json`)
- [ ] Store listing assets: screenshots per device class, feature graphic, description
- [ ] Native push credentials (APNs / FCM) if web push is replaced

## Related docs

- [SECURITY-CHECKLIST.md](./SECURITY-CHECKLIST.md) — production promotion gate
- [ARCHITECTURE.md](./ARCHITECTURE.md) — layer model
- [DEV-PROMOTION.md](./DEV-PROMOTION.md) — promotion workflow
