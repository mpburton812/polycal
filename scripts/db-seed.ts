import { runMigrations } from "../src/lib/db/migrate";
import { seedDemoPartnerships } from "../src/lib/seed/demo-partnerships";
import { seedDemoProposals } from "../src/lib/seed/demo-proposals";
import {
  getSeedDefaultPasswordHint,
  seedStarWarsFoundation,
} from "../src/lib/seed/star-wars";

async function main(): Promise<void> {
  await runMigrations();
  const { seeded } = await seedStarWarsFoundation();
  const demo = await seedDemoProposals();
  const partnerships = await seedDemoPartnerships();
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
  if (partnerships.count > 0) {
    console.log(`Seeded ${partnerships.count} demo sleeping partnerships.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
