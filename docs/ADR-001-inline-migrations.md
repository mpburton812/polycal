# ADR-001: Inline SQLite migrations (no Drizzle migration files)

## Status

Accepted — 2026-06-28

## Context

PolyCal uses libSQL/SQLite with Drizzle ORM. Schema is defined in `src/lib/db/schema.ts`, but structural changes are applied at runtime via `ensureColumn` helpers in `*-migrations.ts` modules (e.g. `admin-migrations.ts`, `proposals-migrations.ts`).

## Decision

We **do not** maintain Drizzle Kit migration SQL files for this project. Instead:

1. Update `schema.ts` for type-safe Drizzle models.
2. Add matching `ensureColumn` / `ensureTable` calls in the appropriate migration module.
3. `ensureDbReady()` runs migrations idempotently on app startup and before E2E seeds.

## Consequences

- **Pros:** Single-file deploys; no migration runner in CI; Turso/libSQL friendly; matches current seed/reset workflows.
- **Cons:** No versioned migration history in git; reviewers must verify schema + migration module stay in sync manually.
- **Mitigation:** PR checklist includes schema/migration pairing; Vitest + E2E catch most drift.

## Alternatives considered

- **Drizzle Kit migrations:** Better audit trail but adds deploy complexity for a small team and ephemeral dev DBs.
- **Manual SQL only:** Rejected — loses Drizzle type safety.
