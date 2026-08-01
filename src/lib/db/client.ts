import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { schema } from "./schema";

let client: Client | undefined;
let database: LibSQLDatabase<typeof schema> | undefined;
let foreignKeysReady: Promise<void> | undefined;

/**
 * Turns on SQLite FK enforcement, which is OFF by default on local file DBs but
 * ON in hosted Turso (PC-355). Without it, local/dev silently accept orphaned
 * rows that fail with SQLITE_CONSTRAINT in production.
 *
 * Queued immediately after client creation so it runs ahead of any application
 * statement on the same connection. Remote endpoints that reject the pragma are
 * logged and ignored — they already enforce FKs server-side.
 */
function enableForeignKeys(target: Client): Promise<void> {
  return target
    .execute("PRAGMA foreign_keys = ON")
    .then(() => undefined)
    .catch((error: unknown) => {
      console.warn("[db] could not enable foreign_keys pragma", error);
    });
}

/**
 * Builds the libSQL client — file-backed SQLite locally, Turso remote when URL is set.
 * Token is only required for libsql:// endpoints.
 */
function createDbClient(): Client {
  const url = process.env.TURSO_DATABASE_URL?.trim() || "file:local.db";
  const created = url.startsWith("file:")
    ? createClient({ url })
    : createRemoteClient(url);
  foreignKeysReady = enableForeignKeys(created);
  return created;
}

function createRemoteClient(url: string): Client {
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) {
    throw new Error(
      "TURSO_AUTH_TOKEN is required for remote Turso databases. Check Vercel env for this branch.",
    );
  }
  return createClient({ url, authToken });
}

/** Resolves once the FK pragma has been applied to the active connection (PC-355). */
export async function whenForeignKeysEnabled(): Promise<void> {
  if (!client) getDb();
  await foreignKeysReady;
}

/** Singleton Drizzle handle reused across server requests. */
export function getDb(): LibSQLDatabase<typeof schema> {
  if (!database) {
    client = createDbClient();
    database = drizzle(client, { schema });
  }
  return database;
}

/** Underlying libSQL client for raw SQL migrations. */
export function getSqlClient(): Client {
  if (!client) {
    getDb();
  }
  return client!;
}

/**
 * Clears the process-wide DB singleton so prepare scripts can seed multiple file DBs (PC-176).
 */
export function resetDbSingleton(): void {
  try {
    client?.close();
  } catch {
    // Ignore close errors when switching file URLs during e2e prepare.
  }
  client = undefined;
  database = undefined;
  foreignKeysReady = undefined;
}
