/**
 * Rate limiting for auth-sensitive endpoints (PC-282).
 * In-memory buckets for unit tests / L1; Turso/SQLite for cross-instance persistence.
 */

import { getSqlClient } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Returns true when the key is within the allowed request count for the window.
 * Sync in-memory limiter — used by unit tests and as an L1 cache for the
 * persistent backend.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxRequests) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/**
 * Persistent rate limit backed by `rate_limit_buckets` (Turso/SQLite).
 * Uses the in-memory map as an L1 fast-reject / mirror of the last known bucket.
 */
export async function checkRateLimitPersistent(
  key: string,
  maxRequests: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const mem = buckets.get(key);
  if (mem && now < mem.resetAt && mem.count >= maxRequests) {
    return false;
  }

  await ensureDbReady();
  const sql = getSqlClient();

  const existing = await sql.execute({
    sql: `SELECT count, reset_at FROM rate_limit_buckets WHERE key = ? LIMIT 1`,
    args: [key],
  });
  const row = existing.rows[0];
  const rowResetAt = row ? Number(row.reset_at) : 0;
  const rowCount = row ? Number(row.count) : 0;

  if (!row || now >= rowResetAt) {
    const resetAt = now + windowMs;
    await sql.execute({
      sql: `INSERT INTO rate_limit_buckets (key, count, reset_at) VALUES (?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`,
      args: [key, resetAt],
    });
    buckets.set(key, { count: 1, resetAt });
    return true;
  }

  if (rowCount >= maxRequests) {
    buckets.set(key, { count: rowCount, resetAt: rowResetAt });
    return false;
  }

  const nextCount = rowCount + 1;
  await sql.execute({
    sql: `UPDATE rate_limit_buckets
          SET count = ?
          WHERE key = ? AND reset_at = ? AND count < ?`,
    args: [nextCount, key, rowResetAt, maxRequests],
  });
  buckets.set(key, { count: nextCount, resetAt: rowResetAt });
  return true;
}

/** Clears rate-limit state — test helper only. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
