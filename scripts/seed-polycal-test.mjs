#!/usr/bin/env node
/** Bootstrap + seed polycal-test using .env.vercel-setup token. */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { hash } from "bcryptjs";

function parseEnv(file) {
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
const url = "libsql://polycal-test-mpburton.aws-us-east-2.turso.io";
const client = createClient({ url, authToken: env.TURSO_AUTH_TOKEN_TEST });

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
);
if (tables.rows.length === 0) {
  const bootstrap = readFileSync("src/lib/db/bootstrap-sql.ts", "utf8").match(
    /export const BOOTSTRAP_SQL = `([\s\S]*?)`;/,
  )?.[1];
  if (!bootstrap) throw new Error("BOOTSTRAP_SQL not found");
  for (const statement of bootstrap.split(";").map((s) => s.trim()).filter(Boolean)) {
    await client.execute(`${statement};`);
  }
  console.log("Applied schema to polycal-test");
}

const users = await client.execute("SELECT COUNT(*) AS c FROM users");
if (Number(users.rows[0].c) === 0) {
  const now = new Date().toISOString();
  const passwordHash = await hash("ChangeMe123!", 12);
  await client.execute({
    sql: `INSERT INTO users (id, username, display_name, password_hash, role, status, must_change_password, avatar_key, theme, login_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "sw-luke",
      "luke",
      "Luke Skywalker",
      passwordHash,
      "admin",
      "active",
      0,
      "bird_blue",
      "mint",
      0,
      now,
      now,
    ],
  });
  await client.execute({
    sql: "INSERT INTO poly_group (id, name, updated_at) VALUES (1, ?, ?)",
    args: ["Rebel Alliance", now],
  });
  console.log("Seeded luke user on polycal-test");
} else {
  console.log("polycal-test already has users:", users.rows[0].c);
}
