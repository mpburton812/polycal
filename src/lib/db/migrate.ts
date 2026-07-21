import { BOOTSTRAP_SQL } from "./bootstrap-sql";
import { getSqlClient } from "./client";
import { applyPeoplePlacesMigrations } from "./people-places-migrations";
import { applyAdminMigrations } from "./admin-migrations";
import { applyProposalsMigrations } from "./proposals-migrations";
import { applyAlphaFeedbackMigrations } from "./alpha-feedback-migrations";
import { applyFeedMigrations } from "./feed-migrations";

/** Bump whenever bootstrap DDL or *-migrations.ts modules change (PC-143). */
export const SCHEMA_VERSION = "29";

/**
 * True when the stored schema version already matches the app target — skip
 * expensive ensureColumn / CREATE IF NOT EXISTS round-trips (PC-143).
 */
export function shouldSkipMigrations(
  storedVersion: string | null | undefined,
  targetVersion: string = SCHEMA_VERSION,
): boolean {
  return typeof storedVersion === "string" && storedVersion === targetVersion;
}

/**
 * Applies inline DDL on startup so Vercel previews and local dev share one path
 * without a separate migration runner in Phase 0.
 *
 * When `schema_meta.version` already equals {@link SCHEMA_VERSION}, returns
 * immediately after a single SELECT (cold-start short-circuit).
 */
export async function runMigrations(): Promise<void> {
  const sql = getSqlClient();

  try {
    const existing = await sql.execute({
      sql: `SELECT value FROM schema_meta WHERE key = 'version' LIMIT 1`,
    });
    const stored = existing.rows[0]?.value;
    if (shouldSkipMigrations(typeof stored === "string" ? stored : null)) {
      return;
    }
  } catch {
    // schema_meta missing on a fresh DB — fall through to full migrate.
  }

  const statements = BOOTSTRAP_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.execute(`${statement};`);
  }

  await applyPeoplePlacesMigrations(sql);
  await applyAdminMigrations(sql);
  await applyProposalsMigrations(sql);
  await applyAlphaFeedbackMigrations(sql);
  await applyFeedMigrations(sql);

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [SCHEMA_VERSION],
  });
}
