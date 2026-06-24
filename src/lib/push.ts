import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { pushSubscriptions, users } from "@/lib/db/schema";
import { parseNotificationPrefs } from "@/types/notification-prefs";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
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
 * Sends a Web Push notification to all registered devices for a user when configured.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) return;

  await ensureDbReady();
  const db = getDb();
  const [userRow] = await db
    .select({ notificationPrefsJson: users.notificationPrefsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const prefs = parseNotificationPrefs(userRow?.notificationPrefsJson);
  if (!prefs.globalEnabled || !prefs.channels.device) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const webpush = await import("web-push");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const body = JSON.stringify(payload);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body,
      );
    } catch {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
    }
  }
}

/**
 * Public VAPID key exposed to the client for PushManager.subscribe (PC-43).
 */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}
