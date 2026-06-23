import type { Client } from "@libsql/client";

/**
 * Phase 2 additive migrations — safe to run on databases created at schema v1/v2.
 */
export async function applyPeoplePlacesMigrations(sql: Client): Promise<void> {
  await ensureColumn(sql, "poly_group", "allow_user_provisioning", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "locations", "address", "TEXT");
  await ensureColumn(sql, "locations", "bedroom_count", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(sql, "locations", "bedroom_names", "TEXT");
  await ensureColumn(sql, "locations", "created_by_id", "TEXT REFERENCES users(id)");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS sleeping_partnerships (
      id TEXT PRIMARY KEY NOT NULL,
      user_low_id TEXT NOT NULL REFERENCES users(id),
      user_high_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      proposed_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      responded_at TEXT,
      UNIQUE(user_low_id, user_high_id)
    );
  `);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS location_residents (
      id TEXT PRIMARY KEY NOT NULL,
      location_id TEXT NOT NULL REFERENCES locations(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL,
      proposed_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      responded_at TEXT,
      UNIQUE(location_id, user_id)
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
