/**
 * Minimal bounded-concurrency pool (PC-355).
 *
 * `p-limit` is not a dependency and pulling one in for a dozen lines is not
 * worth the supply-chain surface, so this is the local equivalent: a fixed set
 * of workers pulling from a shared cursor. Results keep input order, and a
 * rejected task rejects the whole call — callers that must not abort siblings
 * should catch inside their own task function.
 */

/** Runs `task` over `items` with at most `limit` in flight; preserves order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const workerCount = Math.max(1, Math.floor(limit));
  const results = new Array<R>(items.length);

  if (items.length <= 1 || workerCount === 1) {
    for (let index = 0; index < items.length; index += 1) {
      results[index] = await task(items[index]!, index);
    }
    return results;
  }

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(workerCount, items.length) },
    async () => {
      for (let index = cursor++; index < items.length; index = cursor++) {
        results[index] = await task(items[index]!, index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}
