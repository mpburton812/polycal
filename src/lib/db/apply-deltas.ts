import type { Client } from "@libsql/client";

import { SCHEMA_DELTA_SQL } from "./delta-sql";

/**
 * Versions at or below this already have the inline ensureColumn history baked
 * in. Newer versions apply only {@link SCHEMA_DELTA_SQL} (PC-537).
 */
export const LEGACY_SCHEMA_CEILING = 56;

/**
 * True when a database still needs the historical ensureColumn chain.
 * Missing versions and anything below the freeze ceiling take that path.
 */
export function needsLegacyMigrations(storedVersion: string | null | undefined): boolean {
  if (typeof storedVersion !== "string" || storedVersion.trim() === "") return true;
  const parsed = Number(storedVersion);
  if (!Number.isFinite(parsed)) return true;
  return parsed < LEGACY_SCHEMA_CEILING;
}

/** Numeric schema version, or null when the stored value is not a number. */
export function parseSchemaVersion(storedVersion: string | null | undefined): number | null {
  if (typeof storedVersion !== "string") return null;
  const parsed = Number(storedVersion);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Applies delta SQL for each version strictly after `fromVersion` through
 * `toVersion`. Duplicate-column errors are ignored so a delta can re-run.
 */
export async function applySchemaDeltas(
  sql: Client,
  fromVersion: number,
  toVersion: number,
): Promise<void> {
  const versions = Object.keys(SCHEMA_DELTA_SQL)
    .map((version) => Number(version))
    .filter((version) => version > fromVersion && version <= toVersion)
    .sort((a, b) => a - b);

  for (const version of versions) {
    const raw = SCHEMA_DELTA_SQL[version] ?? "";
    const statements = raw
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0 && !statement.startsWith("--"));
    for (const statement of statements) {
      try {
        await sql.execute(`${statement};`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/duplicate column/i.test(message)) continue;
        throw error;
      }
    }
  }
}
