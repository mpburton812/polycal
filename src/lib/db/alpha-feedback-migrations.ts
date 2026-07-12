import type { Client } from "@libsql/client";

/**
 * Alpha feedback submissions table (PC-119) + archive (PC-136) + comment log (PC-182).
 */
export async function applyAlphaFeedbackMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS alpha_feedback_submissions (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
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

  // Idempotent adds for DBs created before PC-136 / PC-182.
  for (const column of ["archived_at TEXT", "comment_log TEXT"]) {
    try {
      await sql.execute(
        `ALTER TABLE alpha_feedback_submissions ADD COLUMN ${column}`,
      );
    } catch {
      // Column already exists
    }
  }
}
