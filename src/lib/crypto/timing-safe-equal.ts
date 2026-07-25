/**
 * Minimum number of code units compared, so secrets of ordinary length take the
 * same time regardless of how long they actually are.
 */
const MIN_COMPARE_LENGTH = 256;

/**
 * Constant-time comparison for shared secrets and bearer tokens (PC-353).
 *
 * `===` on strings short-circuits at the first differing byte, which leaks the
 * matching prefix length to an attacker who can time enough requests. This walks
 * a fixed number of code units and accumulates the difference with bitwise OR so
 * no comparison exits early.
 *
 * Implemented in plain JavaScript rather than `node:crypto.timingSafeEqual`
 * because the Edge middleware gates `/api/e2e/*` with it, and the Edge runtime
 * has no Node crypto module. It is also synchronous, which Web Crypto is not.
 */
export function timingSafeEqualStrings(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  // Folded into the accumulator rather than returned early, so a length mismatch
  // is not distinguishable by timing from a content mismatch.
  let difference = a.length ^ b.length;

  const comparisons = Math.max(a.length, b.length, MIN_COMPARE_LENGTH);
  for (let index = 0; index < comparisons; index += 1) {
    const codeA = index < a.length ? a.charCodeAt(index) : 0;
    const codeB = index < b.length ? b.charCodeAt(index) : 0;
    difference |= codeA ^ codeB;
  }

  return difference === 0;
}
