import type { Client } from "@libsql/client";

/**
 * PC-280 UX cleanup batch — data cleanup for the removed privacy levels, power
 * management, and sleeping network visibility settings. Columns are kept in place
 * (SQLite `ALTER TABLE ... DROP COLUMN` support is inconsistent across drivers) so
 * this migration only backfills/normalizes values; the app code no longer reads the
 * retired columns.
 */
export async function applyPc280Migrations(sql: Client): Promise<void> {
  const flag = await sql.execute(
    `SELECT value FROM schema_meta WHERE key = 'pc280_cleanup_v1' LIMIT 1`,
  );
  if (flag.rows.length > 0) {
    return;
  }

  // Privacy purge: every proposal (including events) is force-opened; no more
  // private/super_private masking anywhere in the app.
  await sql.execute(`UPDATE proposals SET event_privacy = 'open' WHERE event_privacy != 'open'`);

  // Power management purge: restore any roles captured by an "all admin" snapshot,
  // then clear the snapshot and force the default admin_user mode.
  const groups = await sql.execute(
    `SELECT id, power_management_mode, role_snapshots_json FROM poly_group`,
  );
  for (const row of groups.rows) {
    const snapshotJson = row.role_snapshots_json;
    if (typeof snapshotJson === "string" && snapshotJson.length > 0) {
      try {
        const snapshots = JSON.parse(snapshotJson) as Record<string, string>;
        for (const [userId, role] of Object.entries(snapshots)) {
          await sql.execute({
            sql: `UPDATE users SET role = ? WHERE id = ?`,
            args: [role === "admin" ? "admin" : "user", userId],
          });
        }
      } catch {
        /* ignore corrupt snapshot — fall through to reset below */
      }
    }
  }
  await sql.execute(
    `UPDATE poly_group SET power_management_mode = 'admin_user', role_snapshots_json = NULL`,
  );

  // Sleeping network visibility hard-defaults to "involved" everywhere (PC-280).
  await sql.execute(`UPDATE poly_group SET sleeping_network_visibility = 'involved'`);

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('pc280_cleanup_v1', '1')
          ON CONFLICT(key) DO NOTHING`,
    args: [],
  });
}
