import { logUserActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { sendPushToUser } from "@/lib/push";
import { parseNotificationPrefs, type NotificationPrefs } from "@/types/notification-prefs";
import { eq } from "drizzle-orm";

const URGENT_NOTIFICATION_TYPES = new Set(["password_reset", "account_paused", "account_deleted"]);

/**
 * Returns true when local time falls inside the user's quiet-hours window (PC-45).
 * Supports overnight ranges (e.g. 22:00–07:00).
 */
export function isInQuietHours(prefs: NotificationPrefs, now = new Date()): boolean {
  const { quietHoursStart, quietHoursEnd } = prefs;
  if (!quietHoursStart || !quietHoursEnd) return false;

  const [startH, startM] = quietHoursStart.split(":").map(Number);
  const [endH, endM] = quietHoursEnd.split(":").map(Number);
  if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return minutesNow >= startMinutes && minutesNow < endMinutes;
  }
  return minutesNow >= startMinutes || minutesNow < endMinutes;
}

/**
 * During quiet hours we suppress in-app and push delivery unless device is the only channel (PC-45).
 */
function shouldSuppressRealtimeDelivery(prefs: NotificationPrefs, notificationType: string): boolean {
  if (URGENT_NOTIFICATION_TYPES.has(notificationType)) return false;
  if (!isInQuietHours(prefs)) return false;

  const deviceOnly =
    prefs.channels.device && !prefs.channels.email && !prefs.channels.sms;
  return !deviceOnly;
}

function alertTypeAllowed(prefs: NotificationPrefs, notificationType: string): boolean {
  const prefix = notificationType.split("_")[0];
  if (prefix === "partnership" && !prefs.alertTypes.partnerships) return false;
  if (prefix === "proposal" && !prefs.alertTypes.proposals) return false;
  if (prefix === "event" && !prefs.alertTypes.events) return false;
  return true;
}

/**
 * Records a user-targeted system notification in the activity log (PC-40 inbox).
 * Also fans out to Web Push and email hooks when user prefs allow (PC-43).
 */
export async function notifyUser(
  userId: string,
  notificationType: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({ notificationPrefsJson: users.notificationPrefsJson })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const prefs = parseNotificationPrefs(row?.notificationPrefsJson);

  if (!prefs.globalEnabled || !alertTypeAllowed(prefs, notificationType)) return;

  const suppressRealtime = shouldSuppressRealtimeDelivery(prefs, notificationType);

  if (!suppressRealtime) {
    await logUserActivity(
      userId,
      `notification.${notificationType}`,
      JSON.stringify({ message, ...metadata }),
      "system",
    );

    await sendPushToUser(userId, {
      title: formatPushTitle(notificationType),
      body: message,
      url: resolveNotificationUrl(notificationType, metadata),
      metadata,
    });
  }

  await maybeQueueEmailNotification(userId, notificationType, message, metadata, prefs);
}

function formatPushTitle(notificationType: string): string {
  return notificationType.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveNotificationUrl(
  notificationType: string,
  metadata?: Record<string, unknown>,
): string {
  if (typeof metadata?.proposalId === "string") return "/proposals";
  if (typeof metadata?.partnershipId === "string") return "/proposals";
  if (notificationType.startsWith("partnership")) return "/proposals";
  return "/proposals";
}

/**
 * Logs an email delivery stub when the user has a verified notification email (PC-43).
 */
async function maybeQueueEmailNotification(
  userId: string,
  notificationType: string,
  message: string,
  metadata?: Record<string, unknown>,
  prefsOverride?: NotificationPrefs,
): Promise<void> {
  await ensureDbReady();
  const db = getDb();
  const [row] = await db
    .select({
      notificationEmail: users.notificationEmail,
      emailVerifiedAt: users.emailVerifiedAt,
      notificationPrefsJson: users.notificationPrefsJson,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.notificationEmail || !row.emailVerifiedAt) return;
  const prefs = prefsOverride ?? parseNotificationPrefs(row.notificationPrefsJson);
  if (!prefs.globalEnabled || !prefs.channels.email) return;
  if (!alertTypeAllowed(prefs, notificationType)) return;

  await logUserActivity(
    userId,
    "notification.email_queued",
    JSON.stringify({
      to: row.notificationEmail,
      notificationType,
      message,
      ...metadata,
    }),
    "system",
  );

  try {
    const result = await sendEmail({
      to: row.notificationEmail,
      subject: `PolyCal: ${formatPushTitle(notificationType)}`,
      html: `<p>${message}</p>`,
    });
    if (result.sent) {
      await logUserActivity(
        userId,
        "notification.email_sent",
        JSON.stringify({ to: row.notificationEmail, notificationType }),
        "system",
      );
    }
  } catch (error) {
    await logUserActivity(
      userId,
      "notification.email_failed",
      JSON.stringify({
        to: row.notificationEmail,
        notificationType,
        error: error instanceof Error ? error.message : "send failed",
      }),
      "error",
    );
  }
}
