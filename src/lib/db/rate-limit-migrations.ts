import type { Client } from "@libsql/client";

/**
 * Persistent rate-limit buckets shared across server instances (PC-282).
 */
export async function applyRateLimitMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key TEXT PRIMARY KEY NOT NULL,
      count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    )
  `);
}
