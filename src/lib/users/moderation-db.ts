import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { moderationExpired } from "@/lib/users/moderation";

/** Clears expired timed moderation and returns the effective status. */
export async function clearExpiredModeration(userId: string): Promise<string | null> {
  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select({
      status: users.status,
      moderationExpiresAt: users.moderationExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  if (
    (user.status === "paused" || user.status === "banned") &&
    moderationExpired(user.moderationExpiresAt)
  ) {
    const now = new Date().toISOString();
    await db
      .update(users)
      .set({
        status: "active",
        moderationReason: null,
        moderationExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    return "active";
  }
  return user.status;
}

export async function getModerationDisplayForUser(userId: string): Promise<{
  status: string;
  reason: string | null;
  expiresAt: string | null;
} | null> {
  await clearExpiredModeration(userId);
  await ensureDbReady();
  const db = getDb();
  const [user] = await db
    .select({
      status: users.status,
      moderationReason: users.moderationReason,
      moderationExpiresAt: users.moderationExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  return {
    status: user.status,
    reason: user.moderationReason,
    expiresAt: user.moderationExpiresAt,
  };
}
