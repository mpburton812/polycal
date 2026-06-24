import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { polyGroup } from "@/lib/db/schema";
import type { UserRole } from "@/types/user";

/**
 * Whether the user may access Admin tab features (role or power-management override).
 */
export async function userHasAdminAccess(role: UserRole): Promise<boolean> {
  if (role === "admin") return true;

  await ensureDbReady();
  const db = getDb();
  const [group] = await db.select().from(polyGroup).where(eq(polyGroup.id, 1)).limit(1);
  return group?.powerManagementMode === "all_admin";
}
