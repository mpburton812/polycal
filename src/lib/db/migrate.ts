import { BOOTSTRAP_SQL } from "./bootstrap-sql";
import { getSqlClient } from "./client";

const SCHEMA_VERSION = "1";

/**
 * Applies inline DDL on startup so Vercel previews and local dev share one path
 * without a separate migration runner in Phase 0.
 */
export async function runMigrations(): Promise<void> {
  const sql = getSqlClient();
  await sql.executeMultiple(BOOTSTRAP_SQL);

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [SCHEMA_VERSION],
  });
}
