/** Inline DDL for Phase 0 — applied idempotently via runMigrations(). */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  avatar_key TEXT,
  theme TEXT NOT NULL DEFAULT 'mint',
  login_count INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poly_group (
  id INTEGER PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stored_images (
  id TEXT PRIMARY KEY NOT NULL,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  proposal_type TEXT NOT NULL,
  state TEXT NOT NULL,
  proposer_id TEXT NOT NULL REFERENCES users(id),
  location_id TEXT REFERENCES locations(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;
