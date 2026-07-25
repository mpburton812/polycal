# Google Calendar sync — triage & recovery (PC-346 / PC-347)

## Expected behavior

- Sync runs for **each participant who has** a `calendar_connections` row (Google or ICS). Missing Google for an invitee does **not** block the proposer.
- Non-batch sleeping → **one** all-day free/transparent Google event spanning `scheduledStartAt` → `scheduledEndAt`.
- Batch sleeping → **one all-day free event per night** (per-night LOCATION + title with `, at Location`; no “Confirmed” in resolved titles). Each night syncs only for the proposer and that night’s invitees (PC-351).
- `calendar_event_links` keys events by `(user_id, proposal_id, night_key)` (empty `night_key` for single-span events).
- Admin **Fast sleeping plan add** force-resolves with **awaited** calendar sync (not only `after()`).
- Success / skip / failure surfaces as inbox notifications: `calendar_google_synced` / `calendar_google_failed`.

## Production miss checklist

When PolyCal shows nights but Google does not:

1. **Profile → Calendar integration**
   - Provider is Google, status is **active** (not needs reconnect).
   - A writable calendar is selected (`google_calendar_id` set). OAuth alone is not enough.
2. **Vercel logs** (production) for the resolve / Fast-add timestamp:
   - `[calendar-sync] start` / `done`
   - `skip: no calendar connections for participants` ← **confirmed on 2026-07-24 Fast sleeping admin POST /admin** for proposal `prop-833f27aa-…` (neither listed `userIds` had a `calendar_connections` row)
   - `skip google: no calendar selected`
   - `skip google: no access token (needs reconnect?)`
   - `provider failed` / `calendar.sync_failed` audit
3. **Database** (Turso production), for the affected user / proposal:
   - `calendar_connections`: `provider`, `status`, `google_calendar_id`
   - `calendar_event_links`: row(s) with `google_event_id` for that `proposal_id` + `user_id` (one row per `night_key` for batch)
4. **Google UI**: look for **all-day free** night(s) — batch plans show one block per night (easy to miss vs timed events).

### Confirmed production root cause (2026-07-24)

Admin Fast sleeping at ~15:01 UTC logged:

`[calendar-sync] skip: no calendar connections for participants … userIds=prod-…,user-…`

So Google never ran: the production DB had **no** `calendar_connections` for the proposer or invitee at resolve time. Fix: connect Google (+ select calendar) on production Profile for that account, then **Retry calendar sync** on the proposal.

## Recovery

1. Fix connect: Reconnect Google if needed → confirm a calendar is selected (primary auto-saves after OAuth when unset).
2. Open the resolved proposal → **Retry calendar sync**.
3. Confirm inbox notification “Added to Google Calendar…” (or a failure message with Profile link).
4. If still empty: verify `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` / `CALENDAR_TOKEN_ENCRYPTION_KEY` on the production Vercel project match the environment used when the user connected (encryption key rotation orphans tokens → needs reconnect).

## Env (production)

| Variable | Role |
|----------|------|
| `GOOGLE_CLIENT_ID` | OAuth client |
| `GOOGLE_CLIENT_SECRET` | OAuth secret |
| `GOOGLE_REDIRECT_URI` | Must match GCP + production callback URL |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | AES key for stored tokens — **do not rotate** without forcing reconnect |
