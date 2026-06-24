import { getSqlClient } from "@/lib/db/client";
import { isNonProductionEnvironment } from "@/lib/env";
import { seedDemoPartnerships } from "@/lib/seed/demo-partnerships";
import { seedDemoProposals } from "@/lib/seed/demo-proposals";
import { seedStarWarsFoundation } from "@/lib/seed/star-wars";

/**
 * Wipes non-production data and re-runs Star Wars + demo proposal seeds.
 */
export async function resetTestDatabase(): Promise<{
  reset: boolean;
  userCount: number;
  proposalCount: number;
}> {
  if (!isNonProductionEnvironment()) {
    throw new Error("Test database reset is disabled in production.");
  }

  const client = getSqlClient();
  await client.execute("DELETE FROM proposal_slot_votes");
  await client.execute("DELETE FROM proposal_comments");
  await client.execute("DELETE FROM proposal_state_log");
  await client.execute("DELETE FROM proposal_time_slots");
  await client.execute("DELETE FROM proposal_invitees");
  await client.execute("DELETE FROM proposals");
  await client.execute("DELETE FROM user_activity_log");
  await client.execute("DELETE FROM location_residents");
  await client.execute("DELETE FROM sleeping_partnerships");
  await client.execute("DELETE FROM stored_images");
  await client.execute("DELETE FROM locations");
  await client.execute("DELETE FROM users");
  await client.execute("DELETE FROM poly_group");

  const { seeded: usersSeeded } = await seedStarWarsFoundation({ force: true });
  const { count: proposalCount } = await seedDemoProposals({ force: true });
  await seedDemoPartnerships({ force: true });

  if (!usersSeeded) {
    throw new Error("Star Wars seed failed after reset.");
  }

  await client.execute({
    sql: `INSERT INTO schema_meta (key, value) VALUES ('seed_reset_at', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [new Date().toISOString()],
  });

  const userRows = await client.execute("SELECT COUNT(*) AS c FROM users");
  const userCount = Number(userRows.rows[0]?.c ?? 0);

  return { reset: true, userCount, proposalCount };
}

/**
 * Runs foundation + demo seeds (idempotent unless force).
 */
export async function runFullNonProductionSeed(): Promise<void> {
  if (!isNonProductionEnvironment()) return;
  await seedStarWarsFoundation();
  await seedDemoProposals();
}
