import { and, eq, like } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { notificationDismissals, userActivityLog } from "@/lib/db/schema";
import {
  INBOX_EXCLUDED_NOTIFICATION_TYPES,
  proposalIdFromNotificationMetadata,
} from "@/lib/notifications-inbox";
import { revalidateNotificationShellPaths } from "@/lib/notifications-revalidate";

/**
 * Inbox copy when a proposal is returned to drafts (PC-261).
 */
export function formatDraftReturnNotification(title: string, reason: string): string {
  const trimmedReason = reason.trim() || "No reason provided";
  return `The ${title} proposal was sent back to drafts : ${trimmedReason}. No additional action required.`;
}

function parseNotificationDetails(
  action: string,
  details: string | null,
): { type: string; metadata: Record<string, unknown> } {
  const type = action.startsWith("notification.")
    ? action.slice("notification.".length)
    : action;

  if (!details) {
    return { type, metadata: {} };
  }

  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const { message: _message, ...metadata } = parsed;
    return { type, metadata };
  } catch {
    return { type, metadata: {} };
  }
}

/**
 * Soft-dismisses every undismissed inbox notification for a proposal across all users (PC-261).
 */
export async function dismissAllNotificationsForProposal(
  proposalId: string,
): Promise<number> {
  await ensureDbReady();
  const db = getDb();

  const rows = await db
    .select()
    .from(userActivityLog)
    .where(
      and(
        eq(userActivityLog.eventType, "system"),
        like(userActivityLog.action, "notification.%"),
      ),
    );

  const now = new Date().toISOString();
  let cleared = 0;

  for (const row of rows) {
    if (!row.userId) continue;
    const parsed = parseNotificationDetails(row.action, row.details);
    if (INBOX_EXCLUDED_NOTIFICATION_TYPES.has(parsed.type)) continue;
    if (proposalIdFromNotificationMetadata(parsed.metadata) !== proposalId) continue;

    await db
      .insert(notificationDismissals)
      .values({ userId: row.userId, logId: row.id, dismissedAt: now })
      .onConflictDoNothing();
    cleared += 1;
  }

  if (cleared > 0) {
    revalidateNotificationShellPaths();
  }
  return cleared;
}
