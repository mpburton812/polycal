#!/usr/bin/env node
/**
 * Validates polycal-test matches the Burton-Thompson family fixture set.
 *
 * Usage: node scripts/validate-test-seed.mjs
 */
import { createClient } from "@libsql/client";
import { existsSync, readFileSync } from "node:fs";

import { TEST_FAMILY_FIXTURE, TEST_TURSO_DATABASE } from "./lib/test-family-fixtures.mjs";

const tursoHost = "mpburton.aws-us-east-2.turso.io";

function parseEnv(file) {
  if (!file || !existsSync(file)) {
    return {};
  }
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function canonicalPair(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

async function main() {
  const setup = parseEnv(".env.vercel-setup");
  const token = setup.TURSO_AUTH_TOKEN_TEST?.trim();
  if (!token) {
    throw new Error("Missing TURSO_AUTH_TOKEN_TEST in .env.vercel-setup");
  }

  const client = createClient({
    url: `libsql://${TEST_TURSO_DATABASE}-${tursoHost}`,
    authToken: token,
  });

  const failures = [];
  const { expectedCounts } = TEST_FAMILY_FIXTURE;

  const users = await client.execute(
    "SELECT username, display_name, role FROM users ORDER BY username",
  );
  if (users.rows.length !== expectedCounts.users) {
    failures.push(`expected ${expectedCounts.users} users, found ${users.rows.length}`);
  }

  for (const expected of TEST_FAMILY_FIXTURE.users) {
    const row = users.rows.find((user) => user.username === expected.username);
    if (!row) {
      failures.push(`missing user ${expected.username}`);
      continue;
    }
    if (row.display_name !== expected.displayName) {
      failures.push(
        `${expected.username} display name expected ${expected.displayName}, got ${row.display_name}`,
      );
    }
    if (row.role !== expected.role) {
      failures.push(`${expected.username} role expected ${expected.role}, got ${row.role}`);
    }
  }

  const locations = await client.execute("SELECT name FROM locations ORDER BY name");
  if (locations.rows.length !== expectedCounts.locations) {
    failures.push(`expected ${expectedCounts.locations} locations, found ${locations.rows.length}`);
  }
  for (const name of TEST_FAMILY_FIXTURE.locations) {
    if (!locations.rows.some((row) => row.name === name)) {
      failures.push(`missing location ${name}`);
    }
  }

  const partnerships = await client.execute(
    `SELECT u1.username AS low_user, u2.username AS high_user
     FROM sleeping_partnerships sp
     JOIN users u1 ON u1.id = sp.user_low_id
     JOIN users u2 ON u2.id = sp.user_high_id
     WHERE sp.status = 'accepted'`,
  );
  if (partnerships.rows.length !== expectedCounts.partnerships) {
    failures.push(
      `expected ${expectedCounts.partnerships} accepted partnerships, found ${partnerships.rows.length}`,
    );
  }

  const expectedPairs = new Set(
    TEST_FAMILY_FIXTURE.partnerships.map(([a, b]) => canonicalPair(a, b)),
  );
  const actualPairs = new Set(
    partnerships.rows.map((row) => canonicalPair(row.low_user, row.high_user)),
  );
  for (const pair of expectedPairs) {
    if (!actualPairs.has(pair)) {
      failures.push(`missing partnership ${pair.replace(":", " ↔ ")}`);
    }
  }

  const proposals = await client.execute("SELECT COUNT(*) AS c FROM proposals");
  const proposalCount = Number(proposals.rows[0]?.c ?? 0);
  if (proposalCount !== expectedCounts.proposals) {
    failures.push(`expected ${expectedCounts.proposals} proposals, found ${proposalCount}`);
  }

  const group = await client.execute("SELECT name FROM poly_group WHERE id = 1");
  if (group.rows[0]?.name !== TEST_FAMILY_FIXTURE.groupName) {
    failures.push(
      `expected group ${TEST_FAMILY_FIXTURE.groupName}, got ${group.rows[0]?.name ?? "none"}`,
    );
  }

  if (failures.length > 0) {
    console.error("FAIL polycal-test seed validation:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    `PASS polycal-test seed (${expectedCounts.users} users, ${expectedCounts.locations} places, ${expectedCounts.partnerships} partnerships, ${expectedCounts.proposals} proposals)`,
  );
}

main().catch((error) => {
  console.error("validate-test-seed failed:", error.message);
  process.exit(1);
});
