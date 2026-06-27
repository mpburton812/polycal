/**
 * Lazy DB bootstrap for Node runtime — replaces instrumentation.ts so Drizzle/Turso
 * are not bundled into the Edge middleware instrumentation chunk.
 */
let readyPromise: Promise<void> | undefined;

export function ensureDbReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const { runMigrations } = await import("@/lib/db/migrate");
      await runMigrations();

      const { runFullNonProductionSeed } = await import("@/lib/seed/reset-test-database");
      await runFullNonProductionSeed();
    })();
  }

  return readyPromise;
}
