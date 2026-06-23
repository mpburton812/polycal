import { BOOTSTRAP_SQL } from "./bootstrap-sql";
import { getSqlClient } from "./client";
import { applyPeoplePlacesMigrations } from "./people-places-migrations";

const SCHEMA_VERSION = "3";

/**
 * Applies inline DDL on startup so Vercel previews and local dev share one path
 * without a separate migration runner in Phase 0.
 */
export async function runMigrations(): Promise<void> {
  const sql = getSqlClient();
  const statements = BOOTSTRAP_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.execute(`${statement};`);
  }

  await applyPeoplePlacesMigrations(sql);

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [SCHEMA_VERSION],
  });
}
