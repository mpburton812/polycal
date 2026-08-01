import { eq } from "drizzle-orm";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { parseNotificationPrefs } from "@/types/notification-prefs";

export interface PushNotificationAction {
  action: string;
  title: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  notificationType?: string;
  /** Proposal id surfaced to the service worker for inline Accept handling. */
  proposalId?: string;
  /** Notification action buttons rendered by the service worker (PC). */
  actions?: PushNotificationAction[];
  metadata?: Record<string, unknown>;
}

/**
 * Returns whether VAPID keys are configured for outbound Web Push (PC-43).
 */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

/**
 * Logs push delivery outcomes to the user activity log (PC-58).
 */
async function logPushDelivery(
  userId: string,
  action: "notification.push_sent" | "notification.push_failed" | "notification.push_skipped",
  details: Record<string, unknown>,
  eventType: "system" | "error" = "system",
): Promise<void> {
  await logUserActivity(userId, action, JSON.stringify(details), eventType);
}

/**
 * Sends a Web Push notification to all registered devices for a user when configured.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) {
    await logPushDelivery(userId, "notification.push_skipped", {
      reason: "not_configured",
      notificationType: payload.notificationType,
    });
    return;
  }

  await ensureDbReady();
  const db = getDb();
  const [userRow] = await db
    .select({ notificationPrefsJson: users.notificationPrefsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const prefs = parseNotificationPrefs(userRow?.notificationPrefsJson);
  if (!prefs.globalEnabled || !prefs.channels.push) {
    await logPushDelivery(userId, "notification.push_skipped", {
      reason: "push_disabled",
      notificationType: payload.notificationType,
    });
    return;
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) {
    await logPushDelivery(userId, "notification.push_skipped", {
      reason: "no_subscription",
      notificationType: payload.notificationType,
    });
    return;
  }

  const imported = await import("web-push");
  const webpush = imported.default ?? imported;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const body = JSON.stringify(payload);
  let sentCount = 0;
  let failedCount = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
      );
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      await logPushDelivery(
        userId,
        "notification.push_failed",
        {
          notificationType: payload.notificationType,
          subscriptionId: sub.id,
          error: error instanceof Error ? error.message : "send failed",
        },
        "error",
      );
    }
  }

  if (sentCount > 0) {
    await logPushDelivery(userId, "notification.push_sent", {
      notificationType: payload.notificationType,
      deviceCount: sentCount,
      title: payload.title,
    });
  } else if (failedCount > 0 && sentCount === 0) {
    await logPushDelivery(userId, "notification.push_skipped", {
      reason: "all_deliveries_failed",
      notificationType: payload.notificationType,
      failedCount,
    });
  }
}

/**
 * Public VAPID key exposed to the client for PushManager.subscribe (PC-43).
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}
