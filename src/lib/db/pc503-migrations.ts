import type { Client } from "@libsql/client";

/**
 * PC-503 — remove residency proposals: delete proposed membership rows and cancel
 * open proposals whose description is residency metadata JSON.
 */
export async function applyPc503Migrations(sql: Client): Promise<void> {
  const flag = await sql.execute(
    `SELECT value FROM schema_meta WHERE key = 'pc503_residency_cleanup_v1' LIMIT 1`,
  );
  if (flag.rows.length > 0) {
    return;
  }

  await sql.execute(`DELETE FROM location_residents WHERE status = 'proposed'`);

  const now = new Date().toISOString();
  // Open residency drafts/proposals: description is JSON with residencyProposal:true.
  await sql.execute({
    sql: `UPDATE proposals
          SET state = 'archived',
              notes = CASE
                WHEN notes IS NULL OR trim(notes) = '' THEN 'Cancelled: residency proposals removed (PC-503).'
                ELSE notes || char(10) || 'Cancelled: residency proposals removed (PC-503).'
              END,
              updated_at = ?
          WHERE state IN ('draft', 'proposed')
            AND description LIKE '%"residencyProposal"%'`,
    args: [now],
  });

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('pc503_residency_cleanup_v1', '1')
          ON CONFLICT(key) DO NOTHING`,
    args: [],
  });
}
