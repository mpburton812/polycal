#!/usr/bin/env node
/**
 * Apply schema to polycal-prod only — no seed data (production policy).
 *
 * Usage: node scripts/bootstrap-polycal-prod.mjs [.env.vercel-setup]
 */
import { createClient } from "@libsql/client";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const tursoHost = "mpburton.aws-us-east-2.turso.io";
const url = `libsql://polycal-prod-${tursoHost}`;

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

function createProdToken() {
  const output = execFileSync(
    "powershell",
    ["-File", "scripts/turso.ps1", "db", "tokens", "create", "polycal-prod", "--expiration", "never"],
    { encoding: "utf8", shell: true },
  );
  return output.trim().split(/\r?\n/).pop();
}

const sourceFile = process.argv[2] ?? ".env.vercel-setup";
const env = parseEnv(sourceFile);
let token = env.TURSO_AUTH_TOKEN_PROD?.trim();
if (!token) {
  token = createProdToken();
  console.log("(created fresh polycal-prod token)");
}

const client = createClient({ url, authToken: token });
await client.execute("SELECT 1 AS ok");

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
);
if (tables.rows.length > 0) {
  const users = await client.execute("SELECT COUNT(*) AS c FROM users");
  console.log(`polycal-prod schema exists; users=${users.rows[0].c} (no seed applied)`);
  process.exit(0);
}

const bootstrap = readFileSync("src/lib/db/bootstrap-sql.ts", "utf8").match(
  /export const BOOTSTRAP_SQL = `([\s\S]*?)`;/,
)?.[1];
if (!bootstrap) throw new Error("BOOTSTRAP_SQL not found");

for (const statement of bootstrap.split(";").map((s) => s.trim()).filter(Boolean)) {
  await client.execute(`${statement};`);
}

await client.execute({
  sql: `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  args: ["1"],
});

console.log("Applied schema to polycal-prod (no users seeded)");
