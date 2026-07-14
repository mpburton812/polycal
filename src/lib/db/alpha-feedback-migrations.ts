import type { Client } from "@libsql/client";

/**
 * Alpha feedback submissions table (PC-119) + archive (PC-136) + comment log (PC-182)
 * + stable ticket numbers (PC-222).
 */
export async function applyAlphaFeedbackMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS alpha_feedback_submissions (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      ticket_number INTEGER,
      submitter_user_id TEXT NOT NULL REFERENCES users(id),
      submitter_display_name TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      environment TEXT,
      build_sha TEXT,
      build_branch TEXT,
      page_path TEXT,
      viewport_width INTEGER,
      viewport_height INTEGER,
      user_agent TEXT,
      os_label TEXT,
      console_log_tail TEXT,
      screenshot_mime_type TEXT,
      screenshot_data BLOB,
      internal_comment TEXT,
      submitter_comment TEXT,
      comment_log TEXT,
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Idempotent adds for DBs created before PC-136 / PC-182 / PC-222.
  for (const column of ["archived_at TEXT", "comment_log TEXT", "ticket_number INTEGER"]) {
    try {
      await sql.execute(
        `ALTER TABLE alpha_feedback_submissions ADD COLUMN ${column}`,
      );
    } catch {
      // Column already exists
    }
  }

  // Assign permanent ticket numbers by creation order for any rows still missing one.
  await backfillTicketNumbers(sql);

  try {
    await sql.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS alpha_feedback_ticket_number_uidx
      ON alpha_feedback_submissions(ticket_number)
      WHERE ticket_number IS NOT NULL
    `);
  } catch {
    // Index already exists or engine variant does not support the clause
  }
}

/**
 * Backfills `ticket_number` for existing rows ordered by created_at then id (PC-222).
 * Existing numbers are preserved; only NULL values are filled from max+1.
 */
async function backfillTicketNumbers(sql: Client): Promise<void> {
  const missing = await sql.execute(`
    SELECT id FROM alpha_feedback_submissions
    WHERE ticket_number IS NULL
    ORDER BY created_at ASC, id ASC
  `);
  if (missing.rows.length === 0) return;

  const maxResult = await sql.execute(`
    SELECT COALESCE(MAX(ticket_number), 0) AS max_ticket
    FROM alpha_feedback_submissions
  `);
  let next =
    Number(
      (maxResult.rows[0] as { max_ticket?: number | string | null } | undefined)
        ?.max_ticket ?? 0,
    ) || 0;

  for (const row of missing.rows) {
    next += 1;
    const id = String((row as { id: string }).id);
    await sql.execute({
      sql: `UPDATE alpha_feedback_submissions SET ticket_number = ? WHERE id = ? AND ticket_number IS NULL`,
      args: [next, id],
    });
  }
}
