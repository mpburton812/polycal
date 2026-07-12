import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import { schema } from "./schema";

let client: Client | undefined;
let database: LibSQLDatabase<typeof schema> | undefined;

/**
 * Builds the libSQL client — file-backed SQLite locally, Turso remote when URL is set.
 * Token is only required for libsql:// endpoints.
 */
function createDbClient(): Client {
  const url = process.env.TURSO_DATABASE_URL?.trim() || "file:local.db";
  if (url.startsWith("file:")) {
    return createClient({ url });
  }
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!authToken) {
    throw new Error(
      "TURSO_AUTH_TOKEN is required for remote Turso databases. Check Vercel env for this branch.",
    );
  }
  return createClient({ url, authToken });
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
}
