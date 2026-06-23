import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { userActivityLog, users } from "@/lib/db/schema";

/**
 * Records a user-visible action to the activity log (spec §1 audit trail).
 */
export async function logUserActivity(
  userId: string | null,
  action: string,
  details?: string,
): Promise<void> {
  const db = getDb();
  await db.insert(userActivityLog).values({
    userId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Bumps login counters after a successful credentials sign-in.
 */
export async function recordSuccessfulLogin(userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return;

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({
      loginCount: row.loginCount + 1,
      lastLoginAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  await logUserActivity(userId, "login", "Credentials sign-in");
}
