import { BOOTSTRAP_SQL } from "./bootstrap-sql";
import { getSqlClient, whenForeignKeysEnabled } from "./client";
import { applyPeoplePlacesMigrations } from "./people-places-migrations";
import { applyAdminMigrations } from "./admin-migrations";
import { applyProposalsMigrations } from "./proposals-migrations";
import { applyAlphaFeedbackMigrations } from "./alpha-feedback-migrations";
import { applyFeedMigrations } from "./feed-migrations";
import { applyPc280Migrations } from "./pc280-migrations";
import { applyPc503Migrations } from "./pc503-migrations";
import { applyRateLimitMigrations } from "./rate-limit-migrations";
import { applyCalendarMigrations } from "./calendar-migrations";
import { applyPerformanceIndexMigrations } from "./performance-index-migrations";
import { applyNetworksMigrations } from "./networks-migrations";
import { applyMotdMigrations } from "./motd-migrations";
import { applyPlatformLogMigrations } from "./platform-log-migrations";
import { applySchemaDeltas, needsLegacyMigrations, parseSchemaVersion } from "./apply-deltas";

/**
 * Bump whenever bootstrap DDL or *-migrations.ts modules change (PC-143).
 * Hosted databases skip every ensureColumn when schema_meta.version already
 * matches, so a new column without a bump never reaches production (PC-534).
 */
export const SCHEMA_VERSION = "57";

/**
 * SHA-256 of src/lib/db/*-migrations.ts plus bootstrap-sql.ts, keyed by the
 * schema version that introduced that source tree. Append a key when bumping
 * SCHEMA_VERSION; do not rewrite an existing entry (PC-534).
 */
export const SCHEMA_VERSION_SOURCE_SHA256: Record<string, string> = {
  "56": "f954395d8c405b97ae45e98e2a2465dbeefd6d563bee344f78d75923cf8c8b14",
  "57": "01814a539cb8296b0d4d9b9fc23aa519c4fdb4b6ef256e856381f0c71c65a430",
};

/**
 * True when the stored schema version already matches the app target — skip
 * expensive ensureColumn / CREATE IF NOT EXISTS round-trips (PC-143).
 */
export function shouldSkipMigrations(
  storedVersion: string | null | undefined,
  targetVersion: string = SCHEMA_VERSION,
): boolean {
  return typeof storedVersion === "string" && storedVersion === targetVersion;
}

/**
 * Applies inline DDL on startup so Vercel previews and local dev share one path
 * without a separate migration runner in Phase 0.
 *
 * When `schema_meta.version` already equals {@link SCHEMA_VERSION}, returns
 * immediately after a single SELECT (cold-start short-circuit).
 */
export async function runMigrations(): Promise<void> {
  const sql = getSqlClient();
  await whenForeignKeysEnabled();

  let stored: string | null = null;
  try {
    const existing = await sql.execute({
      sql: `SELECT value FROM schema_meta WHERE key = 'version' LIMIT 1`,
    });
    const value = existing.rows[0]?.value;
    stored = typeof value === "string" ? value : null;
    if (shouldSkipMigrations(stored)) {
      return;
    }
  } catch {
    // schema_meta missing on a fresh DB — fall through to full migrate.
  }

  const target = Number(SCHEMA_VERSION);
  if (needsLegacyMigrations(stored)) {
    await applyLegacyMigrations(sql);
    // Legacy modules represent every change through the freeze ceiling.
    // Ticket-named one-shots stay on this path only (PC-541).
    await applySchemaDeltas(sql, 56, target);
  } else {
    await applySchemaDeltas(sql, parseSchemaVersion(stored) ?? 56, target);
  }

  await sql.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [SCHEMA_VERSION],
  });
}

/**
 * Historical bootstrap + ensureColumn chain. Not invoked once schema_meta is
 * already at the freeze ceiling (PC-537).
 */
async function applyLegacyMigrations(sql: Awaited<ReturnType<typeof getSqlClient>>): Promise<void> {
  const statements = BOOTSTRAP_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.execute(`${statement};`);
  }

  await applyPeoplePlacesMigrations(sql);
  await applyAdminMigrations(sql);
  await applyProposalsMigrations(sql);
  await applyAlphaFeedbackMigrations(sql);
  await applyFeedMigrations(sql);
  await applyPc280Migrations(sql);
  await applyPc503Migrations(sql);
  await applyRateLimitMigrations(sql);
  await applyCalendarMigrations(sql);
  await applyNetworksMigrations(sql);
  await applyMotdMigrations(sql);
  await applyPlatformLogMigrations(sql);
  // Indexes last: every table they cover exists by this point (PC-355).
  await applyPerformanceIndexMigrations(sql);
}
