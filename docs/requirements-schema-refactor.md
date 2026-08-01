# Use this template when submitting requirements for PolyCal.
# Source plan: docs/SCHEMA-REFACTOR-PLAN.md

## Epic title
[Epic] Schema refactor: multi-network SSOT + migration hygiene

## Context
After multi-network tenancy (PC-357+), `networks` is the intended settings and isolation boundary, but `poly_group` is still dual-written and read from several paths. Tenant `network_id` columns remain nullable. Inline migrations are correct per ADR-001 but duplicated and bootstrap DDL lags the Drizzle model. This epic completes the schema transition without product behavior changes in early phases.

## Requirements

### REQ-SCHEMA-001: Schema audit script and env report
- **User story:** As an engineer, I want a repeatable audit of Turso envs (null `network_id`s, membership coverage, poly_group↔networks settings drift), so that we know it is safe to cut dual-write and enforce NOT NULL.
- **Acceptance criteria:**
  - [ ] Script or admin diagnostic reports counts for each tenant table’s null `network_id`
  - [ ] Reports whether every active user has ≥1 network membership
  - [ ] Compares legacy/default network settings vs `poly_group` id=1 for drift
  - [ ] Results recorded for dev / test / prod before NOT NULL work
- **Module hint:** `scripts/`, `src/lib/db/`
- **Priority:** High

### REQ-SCHEMA-002: Stop reading poly_group for settings
- **User story:** As the app, I want all settings and enforcement reads to use `networks` / `loadNetworkSettings`, so that multi-network tenants never see singleton poly_group values.
- **Acceptance criteria:**
  - [ ] No `from(polyGroup)` reads in proposals, admin, onboarding, users, access, enforcement (except documented Phase-5 leftovers)
  - [ ] Enforcement/cron uses each proposal’s `network_id`
  - [ ] Unit + journey coverage for settings and TTLs with two networks
- **Module hint:** `src/lib/proposals/`, `src/actions/`
- **Priority:** High

### REQ-SCHEMA-003: Remove poly_group dual-write
- **User story:** As an admin updating network settings, I want a single write to `networks`, so that settings cannot drift across tables.
- **Acceptance criteria:**
  - [ ] `updatePolyGroupSettingsAction` no longer updates `poly_group`
  - [ ] New settings columns are not ensured on `poly_group`
  - [ ] SCHEMA_VERSION bumped; verify script synced; changelog entry
- **Module hint:** `src/actions/poly-group.ts`, `src/lib/db/*-migrations.ts`
- **Priority:** High

### REQ-SCHEMA-004: Enforce NOT NULL network_id
- **User story:** As the platform, I want tenant rows to require `network_id`, so that isolation cannot be bypassed by null scope.
- **Acceptance criteria:**
  - [ ] Phase 0 audit shows zero unexpected nulls (or backfill completed)
  - [ ] Tenant tables + Drizzle schema use NOT NULL + FK to `networks`
  - [ ] Create paths fail fast without active network
  - [ ] SCHEMA_VERSION bumped; Turso verify green on test and production
- **Module hint:** `src/lib/db/schema.ts`, `src/lib/db/networks-migrations.ts`
- **Priority:** High

### REQ-SCHEMA-005: Migration helper + bootstrap + verify hygiene
- **User story:** As an engineer changing schema, I want one shared `ensureColumn` helper, closer bootstrap DDL, and a slightly richer verify script, so that SCHEMA_VERSION bumps stay reliable.
- **Acceptance criteria:**
  - [ ] Shared migrate helpers used by domain migration modules
  - [ ] Bootstrap closer to target schema; still idempotent
  - [ ] Verify asserts version plus a small critical column/index allowlist
  - [ ] ADR-001 / ARCHITECTURE checklist updated
- **Module hint:** `src/lib/db/`, `scripts/verify-turso-schema.mjs`, `docs/ADR-001-inline-migrations.md`
- **Priority:** Medium

### REQ-SCHEMA-006: Optional poly_group drop / dead-column rebuild
- **User story:** As ops, I want an optional follow-up to drop unused `poly_group` and rebuild away dead columns, so that legacy surface area shrinks after a stable release cycle.
- **Acceptance criteria:**
  - [ ] Explicit go/no-go after Phases 1–3 in production
  - [ ] Non-prod rehearsal before prod
  - [ ] Backup / rollback notes in ticket
- **Module hint:** `src/lib/db/`, `docs/`
- **Priority:** Low

## Out of scope
- Normalizing `batch_entries_json` / prefs JSON into relational tables
- Switching to Drizzle Kit migration files (unless ADR-001 is revised)
- Renaming user-facing “poly group” copy (separate UX ticket)

## Dependencies
- Existing multi-network backfills (`networks_backfill_v1`, partnership unique rebuild) present on all Turso envs
- Promotion workflow: feature → dev → test → production

## Open questions
- Should platform-scoped `user_activity_log` rows keep nullable `network_id`?
- Drop `poly_group` in this epic or leave an unused bootstrap stub?
- Column-level verify now or after NOT NULL lands?
