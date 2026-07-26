#!/usr/bin/env node
/**
 * One-time production admin bootstrap — inserts a single admin user when none exists.
 * Usage: node scripts/create-prod-admin.mjs <username> <password> [.env.vercel-setup]
 */
import { createClient } from "@libsql/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const username = process.argv[2];
const password = process.argv[3];
const sourceFile = process.argv[4] ?? ".env.vercel-setup";

if (!username || !password) {
  console.error("Usage: node scripts/create-prod-admin.mjs <username> <password>");
  process.exit(1);
}

function parseEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const env = parseEnv(sourceFile);
const token = env.TURSO_AUTH_TOKEN_PROD?.trim();
if (!token) {
  console.error("TURSO_AUTH_TOKEN_PROD missing in", sourceFile);
  process.exit(1);
}

const client = createClient({
  url: "libsql://polycal-prod-mpburton.aws-us-east-2.turso.io",
  authToken: token,
});

const existing = await client.execute({
  sql: "SELECT id FROM users WHERE username = ?",
  args: [username],
});

if (existing.rows.length > 0) {
  console.error(`User "${username}" already exists (id=${existing.rows[0].id})`);
  process.exit(1);
}

const now = new Date().toISOString();
const passwordHash = await hash(password, 12);
const userId = `prod-${randomUUID()}`;
const isPlatformAdmin =
  username.toLowerCase() === "mpburton" || username.toLowerCase() === "mpburton@gmail.com";

await client.execute({
  sql: `INSERT INTO users (
    id, username, display_name, password_hash, role, status,
    must_change_password, avatar_key, theme, login_count, is_platform_admin,
    notification_email, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'admin', 'active', 0, 'bird_blue', 'mint', 0, ?, ?, ?, ?)`,
  args: [
    userId,
    username,
    username,
    passwordHash,
    isPlatformAdmin ? 1 : 0,
    username.toLowerCase() === "mpburton" ? "mpburton@gmail.com" : null,
    now,
    now,
  ],
});

const group = await client.execute("SELECT id FROM poly_group WHERE id = 1");
if (group.rows.length === 0) {
  await client.execute({
    sql: "INSERT INTO poly_group (id, name, updated_at) VALUES (1, ?, ?)",
    args: ["PolyCal", now],
  });
  console.log("Created default poly_group row");
}

await client.execute({
  sql: `INSERT INTO user_activity_log (user_id, action, details, created_at)
        VALUES (?, 'admin.bootstrap', ?, ?)`,
  args: [userId, JSON.stringify({ username, source: "create-prod-admin.mjs" }), now],
});

const count = await client.execute("SELECT COUNT(*) AS c FROM users");
console.log(`Created admin user "${username}" (id=${userId}); total users=${count.rows[0].c}`);
