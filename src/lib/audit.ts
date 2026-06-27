import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { sleepingPartnerships, userActivityLog, users } from "@/lib/db/schema";

/**
 * Records a user-visible action to the activity log (spec §1 audit trail).
 */
export async function logUserActivity(
  userId: string | null,
  action: string,
  details?: string,
  eventType: "user" | "system" | "error" = "user",
): Promise<void> {
  const db = getDb();
  await db.insert(userActivityLog).values({
    userId,
    action,
    details,
    eventType,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Bumps login counters after a successful credentials sign-in.
 * Reverts passive-auto partnerships on first login after activation (PC-10).
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

  if (row.activatedFromPassiveAt) {
    const partnerships = await db.select().from(sleepingPartnerships);
    for (const partnership of partnerships) {
      if (
        partnership.passiveAutoAccepted &&
        partnership.status === "accepted" &&
        (partnership.userLowId === userId || partnership.userHighId === userId)
      ) {
        await db
          .update(sleepingPartnerships)
          .set({
            status: "proposed",
            passiveAutoAccepted: false,
            updatedAt: now,
            respondedAt: null,
          })
          .where(eq(sleepingPartnerships.id, partnership.id));
      }
    }
    await db
      .update(users)
      .set({ activatedFromPassiveAt: null, updatedAt: now })
      .where(eq(users.id, userId));
  }

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
