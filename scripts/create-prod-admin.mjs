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

const network = await client.execute("SELECT id FROM networks LIMIT 1");
if (network.rows.length === 0) {
  const networkId = `net-${randomUUID()}`;
  await client.execute({
    sql: `INSERT INTO networks (
      id, name, status, allow_user_provisioning, admin_can_see_uninvolved,
      audit_log_visibility, hide_sleeping_arrangements, see_partners_sleeping_arrangements,
      fast_sleep_enabled, feed_enabled, places_map_visibility, log_tail_length,
      proposed_max_days, at_risk_ttl_days, archive_grace_hours, redraft_deadline_hours,
      sleeping_partner_proposal_max_days, created_at, updated_at
    ) VALUES (?, ?, 'active', 0, 1, 'admin_only', 0, 0, 1, 1, 'all', 100, 0, 7, 24, 24, 14, ?, ?)`,
    args: [networkId, "PolyCal", now, now],
  });
  console.log("Created default networks row");
}

await client.execute({
  sql: `INSERT INTO user_activity_log (user_id, action, details, created_at)
        VALUES (?, 'admin.bootstrap', ?, ?)`,
  args: [userId, JSON.stringify({ username, source: "create-prod-admin.mjs" }), now],
});

const count = await client.execute("SELECT COUNT(*) AS c FROM users");
console.log(`Created admin user "${username}" (id=${userId}); total users=${count.rows[0].c}`);
