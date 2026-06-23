import { runMigrations } from "../src/lib/db/migrate";
import { seedDemoProposals } from "../src/lib/seed/demo-proposals";
import {
  getSeedDefaultPasswordHint,
  seedStarWarsFoundation,
} from "../src/lib/seed/star-wars";

async function main(): Promise<void> {
  await runMigrations();
  const { seeded } = await seedStarWarsFoundation();
  const demo = await seedDemoProposals();
  if (seeded) {
    console.log(
      `Seeded Star Wars foundation. Default password: ${getSeedDefaultPasswordHint()}`,
    );
  } else {
    console.log("Star Wars seed skipped (production or users already exist).");
  }
  if (demo.seeded) {
    console.log(`Seeded ${demo.count} demo proposals.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
