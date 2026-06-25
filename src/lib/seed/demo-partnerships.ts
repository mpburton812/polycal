import { randomUUID } from "node:crypto";

import { getDb } from "@/lib/db/client";
import { isNonProductionEnvironment } from "@/lib/env";
import { usesTestFamilySeed } from "@/lib/seed/seed-profile";
import { sleepingPartnerships, users } from "@/lib/db/schema";
import { canonicalUserPair } from "@/lib/users/pair";

const DEMO_EDGES: Array<{ a: string; b: string; status: "accepted" | "proposed" }> = [
  { a: "sw-luke", b: "sw-leia", status: "accepted" },
  { a: "sw-han", b: "sw-leia", status: "accepted" },
  { a: "sw-luke", b: "sw-han", status: "proposed" },
];

/**
 * Seeds demo sleeping partnerships for People tab (PC-36).
 */
export async function seedDemoPartnerships(options?: {
  force?: boolean;
}): Promise<{ count: number }> {
  if (!isNonProductionEnvironment()) {
    return { count: 0 };
  }
  if (usesTestFamilySeed()) {
    return { count: 0 };
  }

  const db = getDb();
  if (!options?.force) {
    const existing = await db
      .select({ id: sleepingPartnerships.id })
      .from(sleepingPartnerships)
      .limit(1);
    if (existing.length > 0) {
      return { count: 0 };
    }
  }

  const userRows = await db.select({ id: users.id }).from(users);
  const userIds = new Set(userRows.map((row) => row.id));
  const now = new Date().toISOString();
  let count = 0;

  for (const edge of DEMO_EDGES) {
    if (!userIds.has(edge.a) || !userIds.has(edge.b)) continue;
    const [userLowId, userHighId] = canonicalUserPair(edge.a, edge.b);
    await db.insert(sleepingPartnerships).values({
      id: `sp-demo-${randomUUID()}`,
      userLowId,
      userHighId,
      status: edge.status,
      proposedById: edge.a,
      createdAt: now,
      updatedAt: now,
      respondedAt: edge.status === "accepted" ? now : null,
    });
    count += 1;
  }

  return { count };
}

export async function countDemoPartnerships(): Promise<number> {
  const db = getDb();
  const rows = await db.select({ id: sleepingPartnerships.id }).from(sleepingPartnerships);
  return rows.length;
}
