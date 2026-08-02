import { and, eq, or } from "drizzle-orm";

import {
  adminAccessFromUserRow,
  userHasAdminAccess,
  type AdminAccessSession,
} from "@/lib/admin-access";
import { getDb } from "@/lib/db/client";
import { sleepingPartnerships } from "@/lib/db/schema";
import type { UserRole } from "@/types/user";

/**
 * Whether a viewer may stream another user's custom avatar blob (PC-78).
 * Prefer passing {@link AdminAccessSession}; bare UserRole is legacy (PC-396).
 */
export async function canViewerAccessCustomAvatar(
  viewerId: string,
  viewerAccess: UserRole | AdminAccessSession,
  ownerId: string,
): Promise<boolean> {
  if (viewerId === ownerId) {
    return true;
  }

  const access =
    typeof viewerAccess === "string"
      ? adminAccessFromUserRow({ role: viewerAccess })
      : viewerAccess;

  if (await userHasAdminAccess(access)) {
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

  return Boolean(partnership);
}
