import { runMigrations } from "../src/lib/db/migrate";
import {
  getSeedDefaultPasswordHint,
  seedStarWarsFoundation,
} from "../src/lib/seed/star-wars";

async function main(): Promise<void> {
  await runMigrations();
  const { seeded } = await seedStarWarsFoundation();
  if (seeded) {
    console.log(
      `Seeded Star Wars foundation. Default password: ${getSeedDefaultPasswordHint()}`,
    );
  } else {
    console.log("Seed skipped (production or users already exist).");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
