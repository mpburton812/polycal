import { runMigrations } from "@/lib/db/migrate";
import { seedStarWarsFoundation } from "@/lib/seed/star-wars";

/**
 * Runs once per Node server boot — migrations then optional non-prod seed.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await runMigrations();
    await seedStarWarsFoundation();
  }
}
