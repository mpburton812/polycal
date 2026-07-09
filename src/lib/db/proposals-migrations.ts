import type { Client } from "@libsql/client";

/**
 * Proposal workflow additive migrations — Phase 4 foundation (PC-40).
 */
export async function applyProposalsMigrations(sql: Client): Promise<void> {
  await ensureColumn(sql, "proposals", "scheduled_start_at", "TEXT");
  await ensureColumn(sql, "proposals", "scheduled_end_at", "TEXT");
  await ensureColumn(sql, "proposals", "intentional_solo", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposals", "event_privacy", "TEXT NOT NULL DEFAULT 'open'");
  await ensureColumn(sql, "proposals", "is_poll", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposals", "at_risk", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposals", "parent_proposal_id", "TEXT REFERENCES proposals(id)");
  await ensureColumn(sql, "proposals", "batch_group_id", "TEXT");
  await ensureColumn(sql, "proposals", "is_batch_sleeping", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposals", "batch_entries_json", "TEXT");
  await ensureColumn(sql, "proposals", "winning_slot_id", "TEXT");
  await ensureColumn(sql, "proposals", "at_risk_expires_at", "TEXT");
  await ensureColumn(sql, "proposals", "recurrence_rule", "TEXT");
  await ensureColumn(sql, "proposals", "occurrence_index", "INTEGER");
  await ensureColumn(sql, "proposals", "is_recurrence_parent", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposals", "bedroom_index", "INTEGER");
  await ensureColumn(sql, "proposals", "location_text", "TEXT");
  await ensureColumn(sql, "proposals", "pending_recovery_until", "TEXT");
  await ensureColumn(sql, "proposals", "reminder_offset_minutes", "INTEGER");
  await ensureColumn(sql, "proposals", "reminder_sent_at", "TEXT");
  await ensureColumn(sql, "proposals", "is_all_day", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposals", "detached_from_parent_id", "TEXT");
  await ensureColumn(sql, "proposals", "detached_from_slot_id", "TEXT");
  await ensureColumn(sql, "proposals", "detached_at", "TEXT");
  await ensureColumn(sql, "poly_group", "recovery_max_hours", "INTEGER NOT NULL DEFAULT 48");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS proposal_invitees (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'required',
      vote_status TEXT NOT NULL DEFAULT 'not_seen',
      responded_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(proposal_id, user_id)
    );
  `);

  await ensureColumn(sql, "proposal_invitees", "vote_status", "TEXT NOT NULL DEFAULT 'not_seen'");
  await ensureColumn(sql, "proposal_invitees", "overlap_acknowledged_at", "TEXT");
  await ensureColumn(sql, "proposal_invitees", "viewed_at", "TEXT");

  await ensureColumn(sql, "poly_group", "proposed_max_hours", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "poly_group", "at_risk_ttl_hours", "INTEGER NOT NULL DEFAULT 168");
  await ensureColumn(sql, "poly_group", "archive_grace_hours", "INTEGER NOT NULL DEFAULT 24");
  await ensureColumn(sql, "poly_group", "redraft_deadline_hours", "INTEGER NOT NULL DEFAULT 24");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS proposal_time_slots (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      start_at TEXT NOT NULL,
      end_at TEXT,
      label TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  await ensureColumn(sql, "proposal_time_slots", "is_all_day", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "proposal_time_slots", "is_detached", "INTEGER NOT NULL DEFAULT 0");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS proposal_slot_votes (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      time_slot_id TEXT NOT NULL REFERENCES proposal_time_slots(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      vote_status TEXT NOT NULL DEFAULT 'not_seen',
      responded_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(time_slot_id, user_id)
    );
  `);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS proposal_state_log (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS proposal_comments (
      id TEXT PRIMARY KEY NOT NULL,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await ensureColumn(sql, "proposal_comments", "slice_tag", "TEXT");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS notification_dismissals (
      user_id TEXT NOT NULL REFERENCES users(id),
      log_id INTEGER NOT NULL REFERENCES user_activity_log(id),
      dismissed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, log_id)
    );
  `);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
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
