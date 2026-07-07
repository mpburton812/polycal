import { and, eq, or } from "drizzle-orm";

import { userHasAdminAccess } from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { sleepingPartnerships } from "@/lib/db/schema";
import type { UserRole } from "@/types/user";

/**
 * Whether a viewer may stream another user's custom avatar blob (PC-78).
 */
export async function canViewerAccessCustomAvatar(
  viewerId: string,
  viewerRole: UserRole,
  ownerId: string,
): Promise<boolean> {
  if (viewerId === ownerId) {
    return true;
  }

  if (await userHasAdminAccess(viewerRole)) {
    return true;
  }

  const db = getDb();
  const [partnership] = await db
    .select({ id: sleepingPartnerships.id })
    .from(sleepingPartnerships)
    .where(
      and(
        eq(sleepingPartnerships.status, "accepted"),
        or(
          and(
            eq(sleepingPartnerships.userLowId, viewerId),
            eq(sleepingPartnerships.userHighId, ownerId),
          ),
          and(
            eq(sleepingPartnerships.userLowId, ownerId),
            eq(sleepingPartnerships.userHighId, viewerId),
          ),
        ),
      ),
    )
    .limit(1);

  if (partnership) {
    return true;
  }

  return false;
}
