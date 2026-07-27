import type { Client } from "@libsql/client";

/**
 * Phase 3 admin/profile migrations — poly group settings, user prefs, audit log types.
 */
export async function applyAdminMigrations(sql: Client): Promise<void> {
  // PC-332: retired columns (group name proposals, power management, per-level event
  // privacy, sleeping network visibility) are no longer ensured. Existing DBs keep the
  // columns; fresh DBs simply omit them. The app no longer reads them.
  await ensureColumn(sql, "poly_group", "audit_log_visibility", "TEXT NOT NULL DEFAULT 'admin_only'");
  await ensureColumn(sql, "poly_group", "hide_sleeping_arrangements", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "poly_group", "places_map_visibility", "TEXT NOT NULL DEFAULT 'all'");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS network_chat_messages (
      id TEXT PRIMARY KEY NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_chat_created ON network_chat_messages(created_at)`,
  );

  const mapDefaultFlag = await sql.execute(
    `SELECT value FROM schema_meta WHERE key = 'places_map_default_all_v1' LIMIT 1`,
  );
  if (mapDefaultFlag.rows.length === 0) {
    await sql.execute(
      `UPDATE poly_group SET places_map_visibility = 'all' WHERE places_map_visibility = 'none'`,
    );
    await sql.execute({
      sql: `INSERT INTO schema_meta (key, value) VALUES ('places_map_default_all_v1', '1')
            ON CONFLICT(key) DO NOTHING`,
      args: [],
    });
  }

  await ensureColumn(sql, "poly_group", "log_tail_length", "INTEGER NOT NULL DEFAULT 100");
  await ensureColumn(sql, "poly_group", "onboarding_welcome_message", "TEXT");

  await ensureColumn(sql, "users", "gender", "TEXT");
  await ensureColumn(sql, "users", "notification_email", "TEXT");
  await ensureColumn(sql, "users", "email_verified_at", "TEXT");
  await ensureColumn(sql, "users", "email_verification_token", "TEXT");
  await ensureColumn(sql, "users", "email_verification_token_expires_at", "TEXT");
  await ensureColumn(sql, "users", "password_reset_token", "TEXT");
  await ensureColumn(sql, "users", "password_reset_token_expires_at", "TEXT");
  await ensureColumn(sql, "users", "notification_prefs_json", "TEXT");
  await ensureColumn(sql, "users", "onboarding_complete", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn(sql, "users", "session_version", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "users", "activated_from_passive_at", "TEXT");
  await ensureColumn(sql, "users", "timezone", "TEXT NOT NULL DEFAULT 'UTC'");
  await ensureColumn(sql, "users", "moderation_reason", "TEXT");
  await ensureColumn(sql, "users", "moderation_expires_at", "TEXT");

  await ensureColumn(sql, "user_activity_log", "event_type", "TEXT NOT NULL DEFAULT 'user'");
  await ensureColumn(sql, "sleeping_partnerships", "passive_auto_accepted", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "sleeping_partnerships", "initiated_by_user_id", "TEXT");
  await ensureColumn(sql, "location_residents", "proposal_id", "TEXT");
}

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
