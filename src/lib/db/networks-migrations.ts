import type { Client } from "@libsql/client";

/**
 * Multi-network tenancy tables + backfill from singleton poly_group (PC-357 / PC-358).
 *
 * Shared-DB row isolation: one environment DB holds many networks; existing data
 * becomes the first network so single-tenant installs keep working unchanged.
 */
export async function applyNetworksMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS networks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by_user_id TEXT REFERENCES users(id),
      created_by_email TEXT,
      allow_user_provisioning INTEGER NOT NULL DEFAULT 0,
      admin_can_see_uninvolved INTEGER NOT NULL DEFAULT 1,
      audit_log_visibility TEXT NOT NULL DEFAULT 'admin_only',
      hide_sleeping_arrangements INTEGER NOT NULL DEFAULT 0,
      places_map_visibility TEXT NOT NULL DEFAULT 'all',
      log_tail_length INTEGER NOT NULL DEFAULT 100,
      onboarding_welcome_message TEXT,
      proposed_max_days INTEGER NOT NULL DEFAULT 0,
      at_risk_ttl_days INTEGER NOT NULL DEFAULT 7,
      archive_grace_hours INTEGER NOT NULL DEFAULT 24,
      redraft_deadline_hours INTEGER NOT NULL DEFAULT 24,
      sleeping_partner_proposal_max_days INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_networks_status ON networks(status)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS network_members (
      id TEXT PRIMARY KEY NOT NULL,
      network_id TEXT NOT NULL REFERENCES networks(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (network_id, user_id)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_members_user ON network_members(user_id, status)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_members_network ON network_members(network_id, status)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS network_setup_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL,
      token_digest TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_network_id TEXT REFERENCES networks(id),
      created_at TEXT NOT NULL
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_setup_tokens_email ON network_setup_tokens(email)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS platform_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      max_networks_per_email INTEGER NOT NULL DEFAULT 3,
      max_network_creates_per_day INTEGER NOT NULL DEFAULT 10,
      updated_at TEXT NOT NULL
    )
  `);

  await ensureColumn(sql, "users", "is_platform_admin", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "users", "owned_by_user_id", "TEXT");

  await ensureColumn(sql, "locations", "network_id", "TEXT");
  await ensureColumn(sql, "proposals", "network_id", "TEXT");
  await ensureColumn(sql, "sleeping_partnerships", "network_id", "TEXT");
  await ensureColumn(sql, "network_chat_messages", "network_id", "TEXT");
  await ensureColumn(sql, "user_activity_log", "network_id", "TEXT");

  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_locations_network ON locations(network_id)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_proposals_network_state ON proposals(network_id, state)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_network ON sleeping_partnerships(network_id)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_chat_network ON network_chat_messages(network_id, created_at)`,
  );

  await rebuildSleepingPartnershipsUnique(sql);
  await backfillLegacyNetwork(sql);
}

/**
 * Partnerships are per-network; replace UNIQUE(user_low, user_high) with
 * UNIQUE(network_id, user_low, user_high) so the same pair can exist in two
 * tenants after optional import (PC-361).
 */
async function rebuildSleepingPartnershipsUnique(sql: Client): Promise<void> {
  const flag = await sql.execute(
    `SELECT value FROM schema_meta WHERE key = 'sleeping_partnerships_network_unique_v1' LIMIT 1`,
  );
  if (flag.rows.length > 0) return;

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS sleeping_partnerships_networked (
      id TEXT PRIMARY KEY NOT NULL,
      network_id TEXT,
      user_low_id TEXT NOT NULL REFERENCES users(id),
      user_high_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      proposed_by_id TEXT NOT NULL REFERENCES users(id),
      initiated_by_user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      responded_at TEXT,
      passive_auto_accepted INTEGER NOT NULL DEFAULT 0,
      UNIQUE(network_id, user_low_id, user_high_id)
    )
  `);

  await sql.execute(`
    INSERT OR IGNORE INTO sleeping_partnerships_networked (
      id, network_id, user_low_id, user_high_id, status, proposed_by_id,
      initiated_by_user_id, created_at, updated_at, responded_at, passive_auto_accepted
    )
    SELECT
      id, network_id, user_low_id, user_high_id, status, proposed_by_id,
      initiated_by_user_id, created_at, updated_at, responded_at,
      COALESCE(passive_auto_accepted, 0)
    FROM sleeping_partnerships
  `);

  await sql.execute(`DROP TABLE sleeping_partnerships`);
  await sql.execute(
    `ALTER TABLE sleeping_partnerships_networked RENAME TO sleeping_partnerships`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_status ON sleeping_partnerships(status)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_low_status ON sleeping_partnerships(user_low_id, status)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_high_status ON sleeping_partnerships(user_high_id, status)`,
  );
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_sleeping_partnerships_network ON sleeping_partnerships(network_id)`,
  );

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('sleeping_partnerships_network_unique_v1', '1')
          ON CONFLICT(key) DO NOTHING`,
    args: [],
  });
}

/**
 * Creates the first network from poly_group, memberships for all users, and
 * stamps existing tenant rows — idempotent via schema_meta flag.
 */
async function backfillLegacyNetwork(sql: Client): Promise<void> {
  const flag = await sql.execute(
    `SELECT value FROM schema_meta WHERE key = 'networks_backfill_v1' LIMIT 1`,
  );
  if (flag.rows.length > 0) {
    return;
  }

  const now = new Date().toISOString();

  const settingsRows = await sql.execute(
    `SELECT * FROM platform_settings WHERE id = 1 LIMIT 1`,
  );
  if (settingsRows.rows.length === 0) {
    await sql.execute({
      sql: `INSERT INTO platform_settings (
        id, max_networks_per_email, max_network_creates_per_day, updated_at
      ) VALUES (1, 3, 10, ?)`,
      args: [now],
    });
  }

  const existingNetworks = await sql.execute(`SELECT id FROM networks LIMIT 1`);
  let networkId: string;

  if (existingNetworks.rows.length > 0) {
    networkId = String(existingNetworks.rows[0].id);
  } else {
    networkId = crypto.randomUUID();
    const group = await sql.execute(`SELECT * FROM poly_group WHERE id = 1 LIMIT 1`);
    const g = group.rows[0] as Record<string, unknown> | undefined;
    const name = typeof g?.name === "string" && g.name ? g.name : "PolyCal Network";
    await sql.execute({
      sql: `INSERT INTO networks (
        id, name, status, created_by_user_id, created_by_email,
        allow_user_provisioning, admin_can_see_uninvolved, audit_log_visibility,
        hide_sleeping_arrangements, places_map_visibility, log_tail_length,
        onboarding_welcome_message, proposed_max_days, at_risk_ttl_days,
        archive_grace_hours, redraft_deadline_hours, sleeping_partner_proposal_max_days,
        created_at, updated_at
      ) VALUES (?, ?, 'active', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        networkId,
        name,
        Number(g?.allow_user_provisioning ?? 0),
        Number(g?.admin_can_see_uninvolved ?? 1),
        String(g?.audit_log_visibility ?? "admin_only"),
        Number(g?.hide_sleeping_arrangements ?? 0),
        String(g?.places_map_visibility ?? "all"),
        Number(g?.log_tail_length ?? 100),
        g?.onboarding_welcome_message != null
          ? String(g.onboarding_welcome_message)
          : null,
        Number(g?.proposed_max_days ?? 0),
        Number(g?.at_risk_ttl_days ?? 7),
        Number(g?.archive_grace_hours ?? 24),
        Number(g?.redraft_deadline_hours ?? 24),
        Number(g?.sleeping_partner_proposal_max_days ?? 5),
        now,
        now,
      ],
    });
  }

  const usersResult = await sql.execute(`SELECT id, role FROM users`);
  for (const row of usersResult.rows) {
    const userId = String(row.id);
    const role = String(row.role);
    const memberRole =
      role === "admin" ? "network_admin" : role === "passive" ? "passive" : "user";
    const memberId = crypto.randomUUID();
    await sql.execute({
      sql: `INSERT INTO network_members (id, network_id, user_id, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'active', ?, ?)
            ON CONFLICT(network_id, user_id) DO NOTHING`,
      args: [memberId, networkId, userId, memberRole, now, now],
    });
  }

  await sql.execute({
    sql: `UPDATE locations SET network_id = ? WHERE network_id IS NULL`,
    args: [networkId],
  });
  await sql.execute({
    sql: `UPDATE proposals SET network_id = ? WHERE network_id IS NULL`,
    args: [networkId],
  });
  await sql.execute({
    sql: `UPDATE sleeping_partnerships SET network_id = ? WHERE network_id IS NULL`,
    args: [networkId],
  });
  await sql.execute({
    sql: `UPDATE network_chat_messages SET network_id = ? WHERE network_id IS NULL`,
    args: [networkId],
  });
  await sql.execute({
    sql: `UPDATE user_activity_log SET network_id = ? WHERE network_id IS NULL`,
    args: [networkId],
  });

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('networks_backfill_v1', '1')
          ON CONFLICT(key) DO NOTHING`,
    args: [],
  });
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
