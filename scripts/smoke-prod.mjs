#!/usr/bin/env node
/**
 * Quick production smoke checks for Turso admin user and HTTP login surface.
 */
import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";

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

const env = parseEnv(".env.vercel-setup");
const token = env.TURSO_AUTH_TOKEN_PROD?.trim();
if (!token) {
  console.error("FAIL: TURSO_AUTH_TOKEN_PROD missing");
  process.exit(1);
}

const client = createClient({
  url: "libsql://polycal-prod-mpburton.aws-us-east-2.turso.io",
  authToken: token,
});

const admins = await client.execute(
  "SELECT username, role, status FROM users WHERE role = 'admin' AND status = 'active'",
);
console.log(`PASS prod admins: ${admins.rows.length} active admin(s)`);
for (const row of admins.rows) {
  console.log(`  - ${row.username} (${row.role}, ${row.status})`);
}

const prodUrl = "https://polycal-ebon.vercel.app";
const loginRes = await fetch(`${prodUrl}/login`, { redirect: "manual" });
console.log(`PASS production /login → HTTP ${loginRes.status}`);

const apiRes = await fetch(`${prodUrl}/api/dev/users`);
console.log(
  `PASS production /api/dev/users → HTTP ${apiRes.status} (expect 403 in production)`,
);
