import type { Client } from "@libsql/client";

/**
 * External calendar integration tables (PC-338) — connections, event ID maps, pending ICS.
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
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, proposal_id)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_calendar_event_links_proposal ON calendar_event_links(proposal_id)`,
  );

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
