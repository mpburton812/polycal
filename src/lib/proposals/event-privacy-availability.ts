import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { polyGroup } from "@/lib/db/schema";
import type { EventPrivacyLevel } from "@/lib/db/schema";

/**
 * Loads enabled event privacy flags from poly group settings (PC-134).
 */
export async function loadEventPrivacyAvailability(db: ReturnType<typeof getDb>): Promise<{
  open: boolean;
  private: boolean;
  superPrivate: boolean;
}> {
  const [row] = await db
    .select({
      eventPrivacyOpen: polyGroup.eventPrivacyOpen,
      eventPrivacyPrivate: polyGroup.eventPrivacyPrivate,
      eventPrivacySuperPrivate: polyGroup.eventPrivacySuperPrivate,
    })
    .from(polyGroup)
    .where(eq(polyGroup.id, 1))
    .limit(1);

  return {
    open: row?.eventPrivacyOpen ?? true,
    private: row?.eventPrivacyPrivate ?? true,
    superPrivate: row?.eventPrivacySuperPrivate ?? true,
  };
}

/**
 * Rejects privacy levels that admins have disabled for new/updated drafts (PC-134).
 */
export async function assertEventPrivacyAllowed(
  db: ReturnType<typeof getDb>,
  eventPrivacy: EventPrivacyLevel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const availability = await loadEventPrivacyAvailability(db);
  if (eventPrivacy === "private" && !availability.private) {
    return {
      ok: false,
      error: "Private events are disabled for this poly group.",
    };
  }
  if (eventPrivacy === "super_private" && !availability.superPrivate) {
    return {
      ok: false,
      error: "Super private events are disabled for this poly group.",
    };
  }
  if (eventPrivacy === "open" && !availability.open) {
    return {
      ok: false,
      error: "Open events are disabled for this poly group.",
    };
  }
  return { ok: true };
}
