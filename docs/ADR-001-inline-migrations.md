# ADR-001: Inline SQLite migrations (no Drizzle migration files)

## Status

Accepted — 2026-06-28

## Context

PolyCal uses libSQL/SQLite with Drizzle ORM. Schema is defined in `src/lib/db/schema.ts`, but structural changes are applied at runtime via `ensureColumn` helpers in `*-migrations.ts` modules (e.g. `admin-migrations.ts`, `proposals-migrations.ts`).

## Decision

We **do not** maintain Drizzle Kit migration SQL files for this project. Instead:

1. Update `schema.ts` for type-safe Drizzle models.
2. Add matching `ensureColumn` / `ensureTable` calls in the appropriate migration module.
3. Bump `SCHEMA_VERSION` in `migrate.ts` whenever bootstrap DDL or migration modules change.
4. `ensureDbReady()` → `runMigrations()` on app startup and before E2E seeds.

**Cold-start short-circuit (PC-143):** When `schema_meta.version` already equals
`SCHEMA_VERSION`, `runMigrations()` returns after a single SELECT and skips bootstrap
DDL plus all `ensureColumn` loops. This avoids ~70 serial Turso `PRAGMA table_info`
round-trips on warm schema versions (typical after idle serverless cold starts).

## Consequences

- **Pros:** Single-file deploys; no migration runner in CI; Turso/libSQL friendly; matches current seed/reset workflows; cheap warm-schema cold starts.
- **Cons:** No versioned migration history in git; reviewers must verify schema + migration module stay in sync manually; forgetting to bump `SCHEMA_VERSION` means new columns never apply on existing DBs.
- **Mitigation:** PR checklist includes schema/migration/`SCHEMA_VERSION` pairing; Vitest + E2E catch most drift.

## Alternatives considered

- **Drizzle Kit migrations:** Better audit trail but adds deploy complexity for a small team and ephemeral dev DBs.
- **Manual SQL only:** Rejected — loses Drizzle type safety.
