import type { Client } from "@libsql/client";

/**
 * External calendar integration tables (PC-338) — connections, event ID maps, pending ICS.
 * PC-351: calendar_event_links.night_key + unique(user_id, proposal_id, night_key).
 */
export async function applyCalendarMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS calendar_connections (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      provider TEXT NOT NULL,
      google_refresh_token_enc TEXT,
      google_access_token_enc TEXT,
      google_token_expires_at TEXT,
      google_calendar_id TEXT,
      google_account_email TEXT,
      ics_delivery TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_calendar_connections_user ON calendar_connections(user_id)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS calendar_event_links (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      provider TEXT NOT NULL,
      google_event_id TEXT,
      google_calendar_id TEXT,
      ics_uid TEXT,
      ics_sequence INTEGER NOT NULL DEFAULT 0,
      night_key TEXT NOT NULL DEFAULT '',
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, proposal_id, night_key)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_calendar_event_links_proposal ON calendar_event_links(proposal_id)`,
  );

  await migrateCalendarEventLinksNightKey(sql);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS calendar_ics_pending (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      ics_uid TEXT NOT NULL,
      ics_sequence INTEGER NOT NULL DEFAULT 0,
      method TEXT NOT NULL,
      filename TEXT NOT NULL,
      ics_body TEXT NOT NULL,
      title TEXT NOT NULL,
      dismissed_at TEXT,
      downloaded_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_calendar_ics_pending_user ON calendar_ics_pending(user_id, dismissed_at, downloaded_at)`,
  );
}

/**
 * Upgrades legacy calendar_event_links (unique user+proposal, no night_key) to
 * per-night keys (PC-351). Safe no-op when already on the new shape.
 */
async function migrateCalendarEventLinksNightKey(sql: Client): Promise<void> {
  const info = await sql.execute(`PRAGMA table_info(calendar_event_links)`);
  const columns = info.rows.map((row) => String(row.name ?? ""));
  if (columns.length === 0) return;

  if (!columns.includes("night_key")) {
    await sql.execute(
      `ALTER TABLE calendar_event_links ADD COLUMN night_key TEXT NOT NULL DEFAULT ''`,
    );
  }

  const master = await sql.execute({
    sql: `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'calendar_event_links' LIMIT 1`,
  });
  const createSql = String(master.rows[0]?.sql ?? "");
  const hasNewUnique =
    /UNIQUE\s*\(\s*user_id\s*,\s*proposal_id\s*,\s*night_key\s*\)/i.test(createSql) ||
    /UNIQUE\s*\(\s*"user_id"\s*,\s*"proposal_id"\s*,\s*"night_key"\s*\)/i.test(createSql);

  if (hasNewUnique) return;

  // SQLite cannot ALTER UNIQUE — rebuild the table with the new constraint.
  await sql.execute(`
    CREATE TABLE calendar_event_links_pc351 (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      provider TEXT NOT NULL,
      google_event_id TEXT,
      google_calendar_id TEXT,
      ics_uid TEXT,
      ics_sequence INTEGER NOT NULL DEFAULT 0,
      night_key TEXT NOT NULL DEFAULT '',
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, proposal_id, night_key)
    )
  `);
  await sql.execute(`
    INSERT INTO calendar_event_links_pc351 (
      id, user_id, proposal_id, provider, google_event_id, google_calendar_id,
      ics_uid, ics_sequence, night_key, last_synced_at, created_at, updated_at
    )
    SELECT
      id, user_id, proposal_id, provider, google_event_id, google_calendar_id,
      ics_uid, ics_sequence, COALESCE(night_key, ''), last_synced_at, created_at, updated_at
    FROM calendar_event_links
  `);
  await sql.execute(`DROP TABLE calendar_event_links`);
  await sql.execute(`ALTER TABLE calendar_event_links_pc351 RENAME TO calendar_event_links`);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_calendar_event_links_proposal ON calendar_event_links(proposal_id)`,
  );
}
