# Implementation Plan: Database Schema Refactor

**Status:** Draft plan (behavior-preserving first; structural cleanup second)  
**App:** PolyCal (polyamory group scheduling)  
**Base:** `dev` @ SCHEMA_VERSION `47`  
**Related ADR:** [ADR-001 — Inline SQLite migrations](./ADR-001-inline-migrations.md)  
**Prior work:** PC-331–333 (schema hygiene), PC-355 (indexes / FK pragma), PC-357–366 (multi-network)

> Notion/Jira MCP auth is unavailable in this agent environment. This plan is the
> source document for a follow-up Jira Epic + `PC-xxx` tickets via
> [requirements-intake-template.md](./requirements-intake-template.md).

---

## Overview

PolyCal’s schema grew organically through inline `ensureColumn` / `CREATE TABLE IF NOT EXISTS` migrations on Turso/libSQL. Multi-network tenancy (`networks`) is the intended settings and isolation boundary, but the singleton `poly_group` table remains dual-written and still read from several code paths. Tenant-scoped rows keep nullable `network_id` columns for backfill safety. Migration helpers are copy-pasted across ~12 modules, and `BOOTSTRAP_SQL` still creates a Phase-0 skeleton that diverges from the Drizzle model in `schema.ts`.

This plan completes the multi-network schema transition, hardens tenant isolation at the DB layer, consolidates migration tooling, and retires legacy dual-write — without changing product behavior in early phases.

---

## Current state (inventory)

### Tables (Drizzle SSOT: `src/lib/db/schema.ts`)

| Domain | Tables |
|--------|--------|
| Identity / tenancy | `users`, `poly_group` (legacy), `networks`, `network_members`, `network_setup_tokens`, `platform_settings` |
| Places | `locations`, `location_residents` |
| Proposals / schedule | `proposals`, `proposal_invitees`, `proposal_time_slots`, `proposal_slot_votes`, `proposal_state_log`, `proposal_comments`, `sleeping_partnerships` |
| Feed / chat | `network_chat_*`, `feed_*`, `proposal_comment_images` |
| Calendar | `calendar_connections`, `calendar_event_links`, `calendar_ics_pending` |
| Platform ops | `motd_*`, `user_activity_log`, `stored_images`, `alpha_feedback_submissions`, `schema_meta`, push/notification tables |

### Migration architecture

- **Pattern:** ADR-001 — runtime inline migrations; bump `SCHEMA_VERSION` in `migrate.ts`; warm-path short-circuit when versions match (PC-143).
- **Bootstrap:** Minimal DDL in `bootstrap-sql.ts` (users, poly_group, locations, proposals, …).
- **Evolution:** Domain modules (`proposals-migrations.ts`, `networks-migrations.ts`, …) each define a private `ensureColumn`.
- **Verify:** `scripts/verify-turso-schema.mjs` checks remote `schema_meta.version` only (not column presence).

### Known debt

1. **Dual-write / dual-read of `poly_group`** — settings updates write `networks` then `poly_group` (PC-366). Readers still hit `poly_group` in `admin.ts`, `onboarding.ts`, `users.ts`, `proposals/_core.ts`, `proposals/slices.ts`, `proposals/access.ts`, `proposals/enforcement.ts`, and fallbacks in `poly-group.ts`.
2. **Nullable `network_id`** on `locations`, `proposals`, `sleeping_partnerships`, `network_chat_messages`, `user_activity_log`, `motd_messages` — backfill sets them, but the schema and app still treat them as optional.
3. **Dead columns on legacy DBs** — PC-332 stopped ensuring retired columns; SQLite columns remain (no `DROP COLUMN` by policy).
4. **Duplicated migration helpers** — identical `ensureColumn` / `hasColumn` in multiple files.
5. **Bootstrap vs target schema drift** — fresh DBs pay many `ALTER TABLE` round-trips before version stamp; warm DBs are fine.
6. **JSON blobs** — `batch_entries_json`, prefs JSON — intentional for now; do not normalize in this epic unless a concrete bug forces it.

---

## Goals

1. Make **`networks` the only settings + tenancy source of truth** for app code.
2. Make **tenant-scoped `network_id` NOT NULL** (with FK) after proving zero nulls in each environment.
3. **Consolidate migration utilities** and keep ADR-001 (no Drizzle Kit migration files).
4. Align **bootstrap DDL** closer to the current target so new installs skip redundant ensures.
5. Keep **SCHEMA_VERSION + verify script** as the deploy gate; optionally deepen verify to assert critical columns/indexes.

## Non-goals

- Redesigning proposal/batch JSON storage.
- Moving to Drizzle Kit SQL migration files (revisit only if ADR-001 is superseded).
- Aggressive `DROP COLUMN` rebuilds on production Turso without an explicit ops ticket and backup plan.
- Changing product UX (admin settings labels can stay “poly group” until a separate copy ticket).

---

## Technical approach

```
Phase 0  Audit & invariants (read-only queries + tests)
   ↓
Phase 1  Code: stop reading poly_group (use loadNetworkSettings / activeNetworkId)
   ↓
Phase 2  Code: stop writing poly_group (remove dual-write)
   ↓
Phase 3  DB: enforce NOT NULL network_id + FK (SCHEMA_VERSION bump)
   ↓
Phase 4  Tooling: shared ensureColumn/hasColumn; richer bootstrap; verify script
   ↓
Phase 5  Optional: drop poly_group table / rebuild dead columns (ops-gated)
```

**Rules that stay true throughout:**

- Every schema change bumps `SCHEMA_VERSION` and syncs `verify-turso-schema.mjs` + `migrate.test.ts`.
- Promote `dev → test → production` per [DEV-PROMOTION.md](./DEV-PROMOTION.md).
- Prefer table rebuild only when SQLite cannot express the change via `ALTER` (documented pattern already used for sleeping partnership unique indexes).

---

## Phases

### Phase 0 — Audit & safety net

**Purpose:** Prove environments are ready before cutting dual-write / nullability.

- [ ] Add a one-shot audit script (or admin-only diagnostic) that reports, per Turso env:
  - Count of rows with `network_id IS NULL` for each tenant table
  - Whether every active user has ≥1 `network_members` row
  - Whether `networks` row count ≥ 1 and `poly_group` id=1 still exists
  - Diff of settings fields between default/legacy network and `poly_group` (detect dual-write drift)
- [ ] Add Vitest coverage for “settings load prefers networks” helpers already in `src/lib/networks/settings.ts`
- [ ] Document audit results in the Epic (dev / test / prod) before Phase 3

**Exit:** Zero unexpected null `network_id`s on test+prod (or a tracked backfill ticket if any remain).

### Phase 1 — Retire `poly_group` reads

**Purpose:** All runtime settings/enforcement reads go through `networks` + active network context.

| File / area | Change |
|-------------|--------|
| `src/lib/proposals/enforcement.ts` | Load TTL / grace from `loadNetworkSettings(networkId)` (per proposal’s `network_id`, not singleton) |
| `src/lib/proposals/access.ts` | Use network settings for `adminCanSeeUninvolved` / sleeping visibility |
| `src/actions/proposals/_core.ts`, `slices.ts` | Same |
| `src/actions/admin.ts`, `onboarding.ts`, `users.ts` | Prefer `loadNetworkSettings` / active network; remove `polyGroup` select |
| `src/actions/poly-group.ts` | Keep action names for UI compatibility; remove poly_group fallbacks once network session is required |

- [ ] Replace each `from(polyGroup)` read with network-scoped load
- [ ] Ensure cron/enforcement paths pass `proposal.networkId` (never assume singleton)
- [ ] Unit + journey coverage for admin settings, onboarding welcome, enforcement TTLs across two networks

**Exit:** `rg "from\\(polyGroup\\)" src` only finds dual-write update (Phase 2) or seed/bootstrap.

### Phase 2 — Retire `poly_group` writes

**Purpose:** Single writer: `networks`.

- [ ] Remove dual-write block in `updatePolyGroupSettingsAction`
- [ ] Stop seeding / resetting `poly_group` in test seeds except as a no-op stub if bootstrap still creates the table
- [ ] Stop ensuring new settings columns on `poly_group` in `networks-migrations.ts` / `admin-migrations.ts` / `proposals-migrations.ts`
- [ ] Bump `SCHEMA_VERSION`; changelog entry; change-control id

**Exit:** App never updates `poly_group` outside optional legacy bootstrap create.

### Phase 3 — Harden `network_id` nullability

**Purpose:** DB-enforced tenancy.

For each of: `locations`, `proposals`, `sleeping_partnerships`, `network_chat_messages`, `user_activity_log`, `motd_messages` (and any other tenant tables discovered in Phase 0):

- [ ] Confirm backfill left 0 nulls (audit script)
- [ ] Rebuild table or use supported ALTER path so `network_id TEXT NOT NULL REFERENCES networks(id)`
- [ ] Update Drizzle `schema.ts` to `.notNull().references(...)`
- [ ] Fail fast in create paths if `activeNetworkId` missing
- [ ] Bump `SCHEMA_VERSION`; run verify on each Turso env after promote

**Exit:** Schema + runtime reject missing network scope.

### Phase 4 — Migration tooling hygiene

**Purpose:** Reduce drift risk; keep ADR-001.

- [ ] Extract shared `ensureColumn` / `hasColumn` / `ensureIndex` to `src/lib/db/migrate-helpers.ts`
- [ ] Expand `BOOTSTRAP_SQL` (or a generated sibling) so fresh DBs create current core tables/columns in fewer round-trips — still idempotent with `IF NOT EXISTS`
- [ ] Keep domain migration modules for one-shot backfills and flags in `schema_meta`
- [ ] Extend `verify-turso-schema.mjs` to assert a small allowlist of critical tables/columns/indexes (not full dump)
- [ ] Document “schema change checklist” in ADR-001 or ARCHITECTURE.md (schema.ts + migrations + SCHEMA_VERSION + verify + changelog)

**Exit:** One helper implementation; verify script catches common promote mistakes.

### Phase 5 — Optional structural cleanup (ops-gated)

**Purpose:** Remove legacy surface area once Phases 1–3 are stable in production.

- [ ] Drop or rename `poly_group` after a full release cycle with no readers/writers
- [ ] Optionally rebuild tables to physically remove PC-280 dead columns on non-prod first
- [ ] Rename public types/actions from `PolyGroup*` → `NetworkSettings*` (copy/API cleanup; can be a separate UX ticket)

**Exit:** Legacy singleton gone from schema + bootstrap; docs updated.

---

## Suggested Jira breakdown

Use project **PC**. Suggested Epic + tasks (map to intake REQs):

| Key (suggested) | Summary | Phase |
|-----------------|---------|-------|
| Epic | Schema refactor: complete multi-network SSOT + migration hygiene | — |
| Task | Schema audit script + env null/`poly_group` drift report | 0 |
| Task | Stop reading `poly_group` in proposals/admin/onboarding | 1 |
| Task | Enforcement/cron uses per-proposal `network_id` settings | 1 |
| Task | Remove `poly_group` dual-write; stop ensuring new poly_group columns | 2 |
| Task | NOT NULL `network_id` + Drizzle sync + SCHEMA_VERSION bump | 3 |
| Task | Shared migrate helpers + bootstrap alignment + richer verify | 4 |
| Task (optional) | Drop `poly_group` / dead-column rebuild (prod ops) | 5 |

---

## Dependencies

- Multi-network backfill flags already applied (`networks_backfill_v1`, partnership unique rebuild) on all envs — confirm via Phase 0 audit.
- Platform admin + network session helpers in `src/lib/networks/*` remain the auth/context layer.
- Promotion path and Turso env isolation per ARCHITECTURE.md.
- Jira credentials for ticket creation (human or local `scripts/create-pc-*.mjs` pattern).

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Settings drift between `poly_group` and `networks` before cutting dual-write | Wrong TTLs / visibility in one code path | Phase 0 drift report; Phase 1 before Phase 2 |
| Null `network_id` rows in prod | Phase 3 migration fails or orphans data | Audit + targeted backfill before NOT NULL |
| SQLite table rebuild mistakes | Data loss / downtime | Rebuild behind `schema_meta` flags; test on `polycal-dev` then `polycal-test`; backups |
| Cold-start regression if bootstrap grows too large | Slower first migrate on empty DB | Keep warm short-circuit; measure fresh migrate once |
| Renaming PolyGroup UX mid-refactor | Scope creep | Defer copy/rename to Phase 5 or separate epic |

---

## Acceptance criteria (epic-level)

- [ ] No production code path reads or writes `poly_group` for settings (Phases 1–2)
- [ ] Tenant tables enforce non-null `network_id` with FK (Phase 3)
- [ ] `SCHEMA_VERSION` bumped with synced verify script; Turso verify green on test + production
- [ ] Shared migration helpers; ADR-001 still accurate
- [ ] Vitest + relevant Playwright journeys green (admin settings, multi-network switch, enforcement)
- [ ] CHANGELOG + `.requirements` entries with `PC-xxx` keys

---

## Open questions

1. Should `user_activity_log.network_id` stay nullable for platform-level (non-network) audit events, or should platform events use a sentinel / separate table?
2. Is dropping `poly_group` required for this epic, or is “unused bootstrap stub” acceptable until a later ops window?
3. Should verify deepen to column-level checks now (Phase 4) or stay version-only until after NOT NULL lands?

---

## References

- `src/lib/db/schema.ts`, `migrate.ts`, `bootstrap-sql.ts`, `*-migrations.ts`
- `src/lib/networks/settings.ts`, `src/actions/poly-group.ts`
- CHANGELOG: PC-331–333, PC-355, PC-357–366
- `docs/ADR-001-inline-migrations.md`, `docs/ARCHITECTURE.md`
