import type { Client } from "@libsql/client";

/**
 * Feed v2: chat comments, multi-image attachments, proposal comment soft-delete (PC-231).
 */
export async function applyFeedMigrations(sql: Client): Promise<void> {
  await sql.execute(`
    CREATE TABLE IF NOT EXISTS network_chat_comments (
      id TEXT PRIMARY KEY NOT NULL,
      message_id TEXT NOT NULL REFERENCES network_chat_messages(id),
      author_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_chat_comments_message ON network_chat_comments(message_id, created_at)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS network_chat_message_images (
      id TEXT PRIMARY KEY NOT NULL,
      message_id TEXT NOT NULL REFERENCES network_chat_messages(id),
      image_id TEXT NOT NULL REFERENCES stored_images(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_network_chat_msg_images ON network_chat_message_images(message_id, sort_order)`,
  );

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS network_chat_comment_images (
      id TEXT PRIMARY KEY NOT NULL,
      comment_id TEXT NOT NULL REFERENCES network_chat_comments(id),
      image_id TEXT NOT NULL REFERENCES stored_images(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS proposal_comment_images (
      id TEXT PRIMARY KEY NOT NULL,
      comment_id TEXT NOT NULL REFERENCES proposal_comments(id),
      image_id TEXT NOT NULL REFERENCES stored_images(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS feed_image_uploads (
      image_id TEXT PRIMARY KEY NOT NULL REFERENCES stored_images(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    )
  `);

  await ensureColumn(sql, "proposal_comments", "deleted_at", "TEXT");

  await sql.execute(`
    CREATE TABLE IF NOT EXISTS feed_likes (
      id TEXT PRIMARY KEY NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE (target_type, target_id, user_id)
    )
  `);
  await sql.execute(
    `CREATE INDEX IF NOT EXISTS idx_feed_likes_target ON feed_likes(target_type, target_id)`,
  );
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
