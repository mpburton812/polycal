/**
 * Simple in-memory sliding-window rate limiter for auth-sensitive endpoints.
 * Resets on process restart; sufficient for single-instance dev/test deployments.
 * Serverless/Vercel: each instance has its own bucket — document until Redis/KV (PC-81).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Returns true when the key is within the allowed request count for the window.
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

/** Clears rate-limit state — test helper only. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
