"use server";

import { and, desc, eq, like, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { notificationDismissals, userActivityLog } from "@/lib/db/schema";
import {
  INBOX_EXCLUDED_NOTIFICATION_TYPES,
  isActionableProposalNotification,
  proposalIdFromNotificationMetadata,
} from "@/lib/notifications-inbox";

export interface NotificationItem {
  id: number;
  type: string;
  message: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Parses notification payload stored in user_activity_log.details (PC-40).
 */
function parseNotificationDetails(
  action: string,
  details: string | null,
): { type: string; message: string; metadata: Record<string, unknown> } {
  const type = action.startsWith("notification.")
    ? action.slice("notification.".length)
    : action;

  if (!details) {
    return { type, message: "", metadata: {} };
  }

  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    const message = typeof parsed.message === "string" ? parsed.message : "";
    const { message: _message, ...metadata } = parsed;
    return { type, message, metadata };
  } catch {
    return { type, message: details, metadata: {} };
  }
}

/**
 * Returns unread system notifications for the signed-in user (PC-40).
 */
export async function getNotificationInboxAction(): Promise<{
  ok: boolean;
  count: number;
  items: NotificationItem[];
}> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, count: 0, items: [] };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;

  const dismissed = await db
    .select({ logId: notificationDismissals.logId })
    .from(notificationDismissals)
    .where(eq(notificationDismissals.userId, userId));
  const dismissedIds = dismissed.map((row) => row.logId);

  const baseFilter = and(
    eq(userActivityLog.userId, userId),
    eq(userActivityLog.eventType, "system"),
    like(userActivityLog.action, "notification.%"),
  );

  const rows =
    dismissedIds.length > 0
      ? await db
          .select()
          .from(userActivityLog)
          .where(and(baseFilter, notInArray(userActivityLog.id, dismissedIds)))
          .orderBy(desc(userActivityLog.createdAt))
          .limit(50)
      : await db
          .select()
          .from(userActivityLog)
          .where(baseFilter)
          .orderBy(desc(userActivityLog.createdAt))
          .limit(50);

  const items: NotificationItem[] = rows
    .map((row) => {
      const parsed = parseNotificationDetails(row.action, row.details);
      return {
        id: row.id,
        type: parsed.type,
        message: parsed.message,
        createdAt: row.createdAt,
        metadata: parsed.metadata,
      };
    })
    .filter((item) => !INBOX_EXCLUDED_NOTIFICATION_TYPES.has(item.type));

  return { ok: true, count: items.length, items };
}

/**
 * Dismisses a single notification for the signed-in user (PC-40).
 */
export async function dismissNotificationAction(
  logId: number,
): Promise<{ ok: boolean; message: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;

  const [row] = await db
    .select({ id: userActivityLog.id })
    .from(userActivityLog)
    .where(
      and(
        eq(userActivityLog.id, logId),
        eq(userActivityLog.userId, userId),
        eq(userActivityLog.eventType, "system"),
        like(userActivityLog.action, "notification.%"),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, message: "Notification not found." };
  }

  const now = new Date().toISOString();
  await db
    .insert(notificationDismissals)
    .values({ userId, logId, dismissedAt: now })
    .onConflictDoNothing();

  revalidatePath("/", "layout");
  return { ok: true, message: "Notification dismissed." };
}

/**
 * Dismisses all visible notifications for the signed-in user (PC-40).
 */
export async function clearAllNotificationsAction(): Promise<{
  ok: boolean;
  message: string;
}> {
  const inbox = await getNotificationInboxAction();
  if (!inbox.ok || inbox.items.length === 0) {
    return { ok: true, message: "No notifications to clear." };
  }

  const session = await auth();
  if (!session?.user) {
    return { ok: false, message: "Sign in required." };
  }

  await ensureDbReady();
  const db = getDb();
  const userId = session.user.id;
  const now = new Date().toISOString();

  for (const item of inbox.items) {
    await db
      .insert(notificationDismissals)
      .values({ userId, logId: item.id, dismissedAt: now })
      .onConflictDoNothing();
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "All notifications cleared." };
}

import {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";

export {
  dismissAllNotificationsForProposal,
  formatDraftReturnNotification,
} from "@/lib/notifications-draft-return";

/**
 * Soft-dismisses actionable inbox rows for a proposal (vote / attendee-update).
 * Leaves informational notices (e.g. proposal_resolved) intact (PC-217).
 */
export async function dismissNotificationsForProposal(
  userId: string,
  proposalId: string,
): Promise<number> {
  await ensureDbReady();
  const db = getDb();

  const dismissed = await db
    .select({ logId: notificationDismissals.logId })
    .from(notificationDismissals)
    .where(eq(notificationDismissals.userId, userId));
  const dismissedIds = dismissed.map((row) => row.logId);

  const baseFilter = and(
    eq(userActivityLog.userId, userId),
    eq(userActivityLog.eventType, "system"),
    like(userActivityLog.action, "notification.%"),
  );

  const rows =
    dismissedIds.length > 0
      ? await db
          .select()
          .from(userActivityLog)
          .where(and(baseFilter, notInArray(userActivityLog.id, dismissedIds)))
      : await db.select().from(userActivityLog).where(baseFilter);

  const now = new Date().toISOString();
  let cleared = 0;

  for (const row of rows) {
    const parsed = parseNotificationDetails(row.action, row.details);
    if (INBOX_EXCLUDED_NOTIFICATION_TYPES.has(parsed.type)) continue;
    if (proposalIdFromNotificationMetadata(parsed.metadata) !== proposalId) continue;
    if (!isActionableProposalNotification(parsed.type, parsed.metadata)) continue;

    await db
      .insert(notificationDismissals)
      .values({ userId, logId: row.id, dismissedAt: now })
      .onConflictDoNothing();
    cleared += 1;
  }

  if (cleared > 0) {
    revalidatePath("/", "layout");
  }
  return cleared;
}
