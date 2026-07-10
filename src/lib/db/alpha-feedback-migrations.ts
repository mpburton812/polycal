import type { Client } from "@libsql/client";

/**
 * Alpha feedback submissions table (PC-119) + archive column (PC-136).
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
      archived_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Idempotent add for DBs created before PC-136.
  try {
    await sql.execute(
      `ALTER TABLE alpha_feedback_submissions ADD COLUMN archived_at TEXT`,
    );
  } catch {
    // Column already exists
  }
}
