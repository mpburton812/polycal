#!/usr/bin/env node
/**
 * Verifies remote Turso databases report the current schema_meta version (PC-71).
 *
 * Usage:
 *   node scripts/verify-turso-schema.mjs              # uses process.env
 *   node scripts/verify-turso-schema.mjs .env.test    # load env file
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

// Keep in sync with SCHEMA_VERSION in src/lib/db/migrate.ts (PC-333).
const EXPECTED_SCHEMA_VERSION = "49";

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
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.");
  process.exit(1);
}

if (url.startsWith("file:")) {
  console.error("Refusing to verify schema against a local file: URL. Point at Turso cloud.");
  process.exit(1);
}

const client = createClient({ url, authToken: token });

try {
  const result = await client.execute(
    "SELECT value FROM schema_meta WHERE key = 'version' LIMIT 1",
  );
  const version = result.rows[0]?.value;
  if (version !== EXPECTED_SCHEMA_VERSION) {
    console.error(
      `Schema version mismatch: expected ${EXPECTED_SCHEMA_VERSION}, got ${String(version ?? "missing")}`,
    );
    process.exit(1);
  }
  console.log(`Schema version OK (${EXPECTED_SCHEMA_VERSION}) for ${url}`);
} catch (error) {
  console.error("Schema verification failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
