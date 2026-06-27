import { getSqlClient } from "@/lib/db/client";
import { isNonProductionEnvironment } from "@/lib/env";
import { seedDemoPartnerships } from "@/lib/seed/demo-partnerships";
import { seedDemoProposals } from "@/lib/seed/demo-proposals";
import { resolveSeedProfile } from "@/lib/seed/seed-profile";
import { seedStarWarsFoundation } from "@/lib/seed/star-wars";
import { seedTestFamilyFoundation } from "@/lib/seed/test-family";

/**
 * Wipes non-production data and re-runs the environment-appropriate seed profile.
 */
export async function resetTestDatabase(): Promise<{
  reset: boolean;
  userCount: number;
  proposalCount: number;
  seedProfile: ReturnType<typeof resolveSeedProfile>;
}> {
  if (!isNonProductionEnvironment()) {
    throw new Error("Test database reset is disabled in production.");
  }

  const seedProfile = resolveSeedProfile();
  const client = getSqlClient();
  await client.execute("DELETE FROM proposal_slot_votes");
  await client.execute("DELETE FROM proposal_comments");
  await client.execute("DELETE FROM proposal_state_log");
  await client.execute("DELETE FROM proposal_time_slots");
  await client.execute("DELETE FROM proposal_invitees");
  await client.execute("DELETE FROM proposals");
  await client.execute("DELETE FROM notification_dismissals");
  await client.execute("DELETE FROM push_subscriptions");
  await client.execute("DELETE FROM user_activity_log");
  await client.execute("DELETE FROM location_residents");
  await client.execute("DELETE FROM sleeping_partnerships");
  await client.execute("DELETE FROM stored_images");
  await client.execute("DELETE FROM locations");
  await client.execute("DELETE FROM users");
  await client.execute("DELETE FROM poly_group");

  let usersSeeded = false;
  let proposalCount = 0;

  if (seedProfile === "test-family") {
    const result = await seedTestFamilyFoundation({ force: true });
    usersSeeded = result.seeded;
  } else {
    const foundation = await seedStarWarsFoundation({ force: true });
    usersSeeded = foundation.seeded;
    const demo = await seedDemoProposals({ force: true });
    proposalCount = demo.count;
    await seedDemoPartnerships({ force: true });
  }

  if (!usersSeeded) {
    throw new Error(`${seedProfile} seed failed after reset.`);
  }

  await client.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('seed_reset_at', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [new Date().toISOString()],
  });

  const userRows = await client.execute("SELECT COUNT(*) AS c FROM users");
  const userCount = Number(userRows.rows[0]?.c ?? 0);

  return { reset: true, userCount, proposalCount, seedProfile };
}

/**
 * Runs foundation + demo seeds (idempotent unless force).
 */
export async function runFullNonProductionSeed(): Promise<void> {
  if (!isNonProductionEnvironment()) return;

  const seedProfile = resolveSeedProfile();
  if (seedProfile === "test-family") {
    await seedTestFamilyFoundation();
    return;
  }

  await seedStarWarsFoundation();
  await seedDemoProposals();
  await seedDemoPartnerships();
}
