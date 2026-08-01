import type { Client } from "@libsql/client";

/**
 * Message of the Day tables — platform or network scoped broadcasts (PC-392).
 */
export async function applyMotdMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS motd_messages (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      network_id TEXT REFERENCES networks(id),
      body TEXT NOT NULL,
      created_by_user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL,
      ends_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_motd_messages_scope_status ON motd_messages(scope, status)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_motd_messages_network_status ON motd_messages(network_id, status)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS motd_acknowledgments (
      motd_id TEXT NOT NULL REFERENCES motd_messages(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      acknowledged_at TEXT NOT NULL,
      UNIQUE (motd_id, user_id)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_motd_acknowledgments_user ON motd_acknowledgments(user_id)`,
  );
}
