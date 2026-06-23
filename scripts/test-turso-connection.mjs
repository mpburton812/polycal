import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

function loadEnvFile(envFile) {
  return Object.fromEntries(
    readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        let value = line.slice(index + 1);
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

const envFile = process.argv[2];
const env = envFile ? loadEnvFile(envFile) : process.env;

const url = env.TURSO_DATABASE_URL;
const token = env.TURSO_AUTH_TOKEN;

if (!url || !token) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in", envFile);
  process.exit(1);
}

const client = createClient({ url, authToken: token });

try {
  const result = await client.execute("SELECT 1 AS ok");
  console.log("SELECT 1:", result.rows[0]);
} catch (error) {
  console.error("SELECT 1 failed:", error.message);
  process.exit(1);
}

const bootstrap = readFileSync("src/lib/db/bootstrap-sql.ts", "utf8").match(
  /export const BOOTSTRAP_SQL = `([\s\S]*?)`;/,
)?.[1];

if (!bootstrap) {
  console.error("Could not read BOOTSTRAP_SQL");
  process.exit(1);
}

try {
  await client.executeMultiple(bootstrap);
  console.log("executeMultiple(BOOTSTRAP): ok");
} catch (error) {
  console.error("executeMultiple(BOOTSTRAP) failed:", error.message);
  const statements = bootstrap
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      await client.execute(`${statement};`);
      console.log("OK:", statement.split("\n")[0].slice(0, 60));
    } catch (statementError) {
      console.error("FAIL:", statement.split("\n")[0].slice(0, 60));
      console.error(" ", statementError.message);
    }
  }
}
