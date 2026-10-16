import { getTableColumns, getTableName } from "drizzle-orm";

import { schema } from "./schema";

/** Table name → Drizzle property names. The committed JSON must match this. */
export type SchemaSnapshot = Record<string, string[]>;

/**
 * Canonical column list for every table registered on the Drizzle `schema`
 * object. Reviewers diff `schema-snapshot.json` instead of inferring shape
 * from the ensureColumn chain (PC-537).
 */
export function buildSchemaSnapshot(): SchemaSnapshot {
  const snapshot: SchemaSnapshot = {};
  for (const value of Object.values(schema)) {
    let tableName: string;
    try {
      tableName = getTableName(value);
    } catch {
      continue;
    }
    snapshot[tableName] = Object.keys(getTableColumns(value)).sort();
  }
  return snapshot;
}
