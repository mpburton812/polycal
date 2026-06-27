import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import type { UserStatus } from "@/types/user";

/**
 * Reads the current account status from the database (source of truth for pause/delete).
 */
export async function getLiveUserStatus(userId: string): Promise<UserStatus | null> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.status ?? null;
}
