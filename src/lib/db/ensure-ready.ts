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

      const { seedStarWarsFoundation } = await import("@/lib/seed/star-wars");
      await seedStarWarsFoundation();

      const { seedDemoProposals } = await import("@/lib/seed/demo-proposals");
      await seedDemoProposals();

      const { seedDemoPartnerships } = await import("@/lib/seed/demo-partnerships");
      await seedDemoPartnerships();
    })();
  }

  return readyPromise;
}
