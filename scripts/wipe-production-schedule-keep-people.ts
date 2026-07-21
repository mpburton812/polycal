/**
 * Production wipe: clear schedule/proposals + Feed chat; keep people/places/accepted ties (PC-289).
 *
 * KEEP
 * - users, poly_group, locations, push_subscriptions, schema_meta
 * - alpha_feedback_submissions, feed_link_previews
 * - sleeping_partnerships WHERE status = 'accepted'
 * - location_residents WHERE status = 'accepted'
 * - avatar stored_images still referenced by users.avatar_key
 *
 * CLEAR
 * - all proposals (events, sleeping arrangements, residency proposals) + child tables
 * - pending sleeping_partnerships / location_residents (status != 'accepted')
 * - Feed chat + chat likes + feed_image_uploads
 * - proposal/chat-related notifications in user_activity_log (+ orphan dismissals)
 * - orphan stored_images no longer referenced
 *
 * ## Runbook (operator only — never CI)
 *
 * Dry-run against production (no deletes):
 * ```bash
 * NEXT_PUBLIC_APP_ENV=production \
 * TURSO_DATABASE_URL=libsql://polycal-prod-… \
 * TURSO_AUTH_TOKEN=… \
 * DRY_RUN=1 \
 * npx tsx scripts/wipe-production-schedule-keep-people.ts
 * ```
 *
 * Live wipe (destructive):
 * ```bash
 * NEXT_PUBLIC_APP_ENV=production \
 * TURSO_DATABASE_URL=libsql://polycal-prod-… \
 * TURSO_AUTH_TOKEN=… \
 * CONFIRM_PROD_WIPE=WIPE_SCHEDULE_KEEP_PEOPLE \
 * npx tsx scripts/wipe-production-schedule-keep-people.ts
 * ```
 *
 * Local smoke dry-run (file DB only):
 * ```bash
 * TURSO_DATABASE_URL=file:local.db DRY_RUN=1 ALLOW_LOCAL_FILE_DRY_RUN=1 \
 * npx tsx scripts/wipe-production-schedule-keep-people.ts
 * ```
 *
 * After live wipe, verify: proposals=0, users/locations unchanged, accepted
 * partnerships/residencies unchanged, chat messages=0.
 */

import { createClient, type Client } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const CONFIRM_PHRASE = "WIPE_SCHEDULE_KEEP_PEOPLE";

type CountRow = { name: string; sql: string };

const KEEP_COUNTS: CountRow[] = [
  { name: "users", sql: "SELECT COUNT(*) AS c FROM users" },
  { name: "locations", sql: "SELECT COUNT(*) AS c FROM locations" },
  {
    name: "sleeping_partnerships_accepted",
    sql: "SELECT COUNT(*) AS c FROM sleeping_partnerships WHERE status = 'accepted'",
  },
  {
    name: "location_residents_accepted",
    sql: "SELECT COUNT(*) AS c FROM location_residents WHERE status = 'accepted'",
  },
  { name: "poly_group", sql: "SELECT COUNT(*) AS c FROM poly_group" },
  { name: "push_subscriptions", sql: "SELECT COUNT(*) AS c FROM push_subscriptions" },
];

const CLEAR_COUNTS: CountRow[] = [
  { name: "proposals", sql: "SELECT COUNT(*) AS c FROM proposals" },
  { name: "proposal_invitees", sql: "SELECT COUNT(*) AS c FROM proposal_invitees" },
  { name: "proposal_time_slots", sql: "SELECT COUNT(*) AS c FROM proposal_time_slots" },
  { name: "proposal_slot_votes", sql: "SELECT COUNT(*) AS c FROM proposal_slot_votes" },
  { name: "proposal_comments", sql: "SELECT COUNT(*) AS c FROM proposal_comments" },
  { name: "proposal_comment_images", sql: "SELECT COUNT(*) AS c FROM proposal_comment_images" },
  { name: "proposal_state_log", sql: "SELECT COUNT(*) AS c FROM proposal_state_log" },
  {
    name: "sleeping_partnerships_pending",
    sql: "SELECT COUNT(*) AS c FROM sleeping_partnerships WHERE status != 'accepted'",
  },
  {
    name: "location_residents_pending",
    sql: "SELECT COUNT(*) AS c FROM location_residents WHERE status != 'accepted'",
  },
  { name: "network_chat_messages", sql: "SELECT COUNT(*) AS c FROM network_chat_messages" },
  { name: "network_chat_comments", sql: "SELECT COUNT(*) AS c FROM network_chat_comments" },
  { name: "feed_likes", sql: "SELECT COUNT(*) AS c FROM feed_likes" },
  { name: "feed_image_uploads", sql: "SELECT COUNT(*) AS c FROM feed_image_uploads" },
];

/**
 * Fail-closed gate: live wipe only against polycal-prod with explicit confirm.
 * Dry-run may target prod or a local file DB (ALLOW_LOCAL_FILE_DRY_RUN=1).
 */
function assertSafetyGates(dryRun: boolean): { url: string } {
  const url = process.env.TURSO_DATABASE_URL?.trim() || "";
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required.");
  }

  const isProdUrl = url.includes("polycal-prod");
  const isFile = url.startsWith("file:");

  if (dryRun) {
    if (isProdUrl) return { url };
    if (isFile && process.env.ALLOW_LOCAL_FILE_DRY_RUN === "1") return { url };
    throw new Error(
      "DRY_RUN requires polycal-prod URL, or file: URL with ALLOW_LOCAL_FILE_DRY_RUN=1.",
    );
  }

  if (process.env.CONFIRM_PROD_WIPE !== CONFIRM_PHRASE) {
    throw new Error(
      `Live wipe requires CONFIRM_PROD_WIPE=${CONFIRM_PHRASE}. Use DRY_RUN=1 to preview.`,
    );
  }

  const appEnv =
    process.env.NEXT_PUBLIC_APP_ENV?.trim() || process.env.APP_ENVIRONMENT?.trim() || "";
  if (appEnv !== "production") {
    throw new Error(
      `Live wipe requires NEXT_PUBLIC_APP_ENV=production (got "${appEnv || "(empty)"}").`,
    );
  }

  if (!isProdUrl) {
    throw new Error(
      `Live wipe requires TURSO_DATABASE_URL containing "polycal-prod" (got "${url}").`,
    );
  }

  if (!process.env.TURSO_AUTH_TOKEN?.trim()) {
    throw new Error("TURSO_AUTH_TOKEN is required for remote Turso.");
  }

  return { url };
}

function createSqlClient(url: string): Client {
  if (url.startsWith("file:")) {
    return createClient({ url });
  }
  return createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN!.trim(),
  });
}

async function countOf(client: Client, sql: string): Promise<number> {
  const result = await client.execute(sql);
  return Number(result.rows[0]?.c ?? 0);
}

async function printCounts(
  client: Client,
  label: string,
  rows: CountRow[],
): Promise<Record<string, number>> {
  console.log(`\n=== ${label} ===`);
  const out: Record<string, number> = {};
  for (const row of rows) {
    const n = await countOf(client, row.sql);
    out[row.name] = n;
    console.log(`  ${row.name}: ${n}`);
  }
  return out;
}

async function execDelete(
  client: Client,
  dryRun: boolean,
  label: string,
  sql: string,
  args: Array<string | number> = [],
): Promise<void> {
  if (dryRun) {
    console.log(`  [dry-run] ${label}: ${sql}`);
    return;
  }
  const result = await client.execute({ sql, args });
  console.log(`  ${label}: deleted rows≈${result.rowsAffected ?? "?"}`);
}

/**
 * Ordered deletes (no ON DELETE CASCADE). See plan PC-289.
 */
async function runWipe(client: Client, dryRun: boolean): Promise<void> {
  console.log(`\n=== ${dryRun ? "DRY-RUN deletes (no writes)" : "LIVE deletes"} ===`);

  // 1) Likes targeting proposal milestones/comments and chat
  await execDelete(
    client,
    dryRun,
    "feed_likes (milestone/proposal_comment/chat/chat_comment)",
    `DELETE FROM feed_likes WHERE target_type IN ('milestone', 'proposal_comment', 'chat', 'chat_comment')`,
  );

  // 2) Proposal comment images
  await execDelete(client, dryRun, "proposal_comment_images", `DELETE FROM proposal_comment_images`);

  // 3) Chat image junctions
  await execDelete(
    client,
    dryRun,
    "network_chat_comment_images",
    `DELETE FROM network_chat_comment_images`,
  );
  await execDelete(
    client,
    dryRun,
    "network_chat_message_images",
    `DELETE FROM network_chat_message_images`,
  );

  // 4) Votes / comments / state log / slots / invitees
  await execDelete(client, dryRun, "proposal_slot_votes", `DELETE FROM proposal_slot_votes`);
  await execDelete(client, dryRun, "proposal_comments", `DELETE FROM proposal_comments`);
  await execDelete(client, dryRun, "proposal_state_log", `DELETE FROM proposal_state_log`);
  await execDelete(client, dryRun, "proposal_time_slots", `DELETE FROM proposal_time_slots`);
  await execDelete(client, dryRun, "proposal_invitees", `DELETE FROM proposal_invitees`);

  // 5) Pending partnerships + residencies
  await execDelete(
    client,
    dryRun,
    "sleeping_partnerships (pending)",
    `DELETE FROM sleeping_partnerships WHERE status != 'accepted'`,
  );
  await execDelete(
    client,
    dryRun,
    "location_residents (pending)",
    `DELETE FROM location_residents WHERE status != 'accepted'`,
  );

  // 6) Detach accepted residencies from proposals before deleting proposals
  await execDelete(
    client,
    dryRun,
    "location_residents.proposal_id → NULL",
    `UPDATE location_residents SET proposal_id = NULL WHERE proposal_id IS NOT NULL`,
  );

  // 7) All proposals (schedule events + sleeping arrangements + residency proposals)
  await execDelete(client, dryRun, "proposals", `DELETE FROM proposals`);

  // 8) Feed chat
  await execDelete(client, dryRun, "network_chat_comments", `DELETE FROM network_chat_comments`);
  await execDelete(client, dryRun, "network_chat_messages", `DELETE FROM network_chat_messages`);
  await execDelete(client, dryRun, "feed_image_uploads", `DELETE FROM feed_image_uploads`);

  // 9) Proposal / chat / partnership / residency notifications
  await execDelete(
    client,
    dryRun,
    "user_activity_log (proposal/chat/partnership/residency/event notifications)",
    `DELETE FROM user_activity_log WHERE
      action LIKE 'notification.proposal%'
      OR action LIKE 'notification.partnership%'
      OR action LIKE 'notification.residency%'
      OR action LIKE 'notification.event_%'
      OR action LIKE 'notification.feed_chat%'
      OR action LIKE 'proposal.%'`,
  );

  // 10) Orphan notification dismissals
  await execDelete(
    client,
    dryRun,
    "notification_dismissals (orphans)",
    `DELETE FROM notification_dismissals WHERE log_id NOT IN (SELECT id FROM user_activity_log)`,
  );

  // 11) Orphan stored_images (keep custom avatars)
  await execDelete(
    client,
    dryRun,
    "stored_images (orphans; keep user avatars)",
    `DELETE FROM stored_images WHERE id NOT IN (
      SELECT SUBSTR(avatar_key, 8) FROM users
      WHERE avatar_key IS NOT NULL AND avatar_key LIKE 'custom:%'
    )`,
  );
}

async function main(): Promise<void> {
  const dryRun = process.env.DRY_RUN === "1";
  const { url } = assertSafetyGates(dryRun);

  console.log(`[wipe] mode=${dryRun ? "DRY_RUN" : "LIVE"}`);
  console.log(`[wipe] database=${url.replace(/\/\/.*@/, "//***@")}`);

  const client = createSqlClient(url);

  const beforeKeep = await printCounts(client, "KEEP tables (before)", KEEP_COUNTS);
  const beforeClear = await printCounts(client, "CLEAR tables (before)", CLEAR_COUNTS);

  await runWipe(client, dryRun);

  if (dryRun) {
    console.log("\n[wipe] Dry-run complete — no rows were deleted.");
    console.log(
      `[wipe] Would clear ~${beforeClear.proposals ?? 0} proposals, ~${beforeClear.network_chat_messages ?? 0} chat messages.`,
    );
    console.log(
      `[wipe] Would keep ${beforeKeep.users ?? 0} users, ${beforeKeep.locations ?? 0} locations, ${beforeKeep.sleeping_partnerships_accepted ?? 0} accepted partnerships, ${beforeKeep.location_residents_accepted ?? 0} accepted residencies.`,
    );
    return;
  }

  const afterKeep = await printCounts(client, "KEEP tables (after)", KEEP_COUNTS);
  const afterClear = await printCounts(client, "CLEAR tables (after)", CLEAR_COUNTS);

  const keepOk =
    afterKeep.users === beforeKeep.users &&
    afterKeep.locations === beforeKeep.locations &&
    afterKeep.sleeping_partnerships_accepted === beforeKeep.sleeping_partnerships_accepted &&
    afterKeep.location_residents_accepted === beforeKeep.location_residents_accepted;

  const clearOk =
    (afterClear.proposals ?? -1) === 0 &&
    (afterClear.network_chat_messages ?? -1) === 0 &&
    (afterClear.sleeping_partnerships_pending ?? -1) === 0 &&
    (afterClear.location_residents_pending ?? -1) === 0;

  if (!keepOk) {
    throw new Error("[wipe] KEEP table counts changed unexpectedly — investigate immediately.");
  }
  if (!clearOk) {
    throw new Error("[wipe] CLEAR tables not fully emptied — investigate immediately.");
  }

  console.log("\n[wipe] LIVE wipe succeeded. Users/places/accepted ties preserved; schedule+chat cleared.");
}

main().catch((error) => {
  console.error("[wipe] Failed:", error);
  process.exit(1);
});
