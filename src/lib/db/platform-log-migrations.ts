import type { Client } from "@libsql/client";

/**
 * Platform system log + per-operator acknowledgments (PC-463 / PC-497).
 * These rows must outlive network hard-wipe — do not FK networkId to networks.
 */
export async function applyPlatformLogMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS platform_system_log (
      id TEXT PRIMARY KEY NOT NULL,
      created_at TEXT NOT NULL,
      network_name TEXT,
      network_id TEXT,
      actor_user_id TEXT REFERENCES users(id),
      actor_display_name TEXT,
      target_user_id TEXT REFERENCES users(id),
      target_display_name TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      emphasized INTEGER NOT NULL DEFAULT 0
    )
  `);
  await ensureColumn(sql, "platform_system_log", "target_user_id", "TEXT REFERENCES users(id)");
  await ensureColumn(sql, "platform_system_log", "target_display_name", "TEXT");
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_platform_system_log_created ON platform_system_log(created_at)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS platform_log_acknowledgments (
      log_id TEXT NOT NULL REFERENCES platform_system_log(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      acknowledged_at TEXT NOT NULL,
      UNIQUE (log_id, user_id)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_platform_log_ack_user ON platform_log_acknowledgments(user_id)`,
  );
}

/** Adds a column when missing so existing Turso/local DBs pick up PC-497 fields. */
async function ensureColumn(
  sql: Client,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const info = await sql.execute(`PRAGMA table_info(${table})`);
  const exists = info.rows.some((row) => row.name === column);
  if (!exists) {
    await sql.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
