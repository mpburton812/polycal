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

 * During quiet hours suppress in-app delivery unless it is the user's only channel (PC-45/PC-58).

 */

function shouldSuppressInAppDelivery(prefs: NotificationPrefs, notificationType: string): boolean {

  if (URGENT_NOTIFICATION_TYPES.has(notificationType)) return false;

  if (!isInQuietHours(prefs)) return false;



  const inAppOnly =

    prefs.channels.inApp && !prefs.channels.email && !prefs.channels.sms && !prefs.channels.push;

  return !inAppOnly;

}



/**

 * During quiet hours suppress push delivery unless push is the user's only channel (PC-58).

 */

function shouldSuppressPushDelivery(prefs: NotificationPrefs, notificationType: string): boolean {

  if (URGENT_NOTIFICATION_TYPES.has(notificationType)) return false;

  if (!isInQuietHours(prefs)) return false;



  const pushOnly =

    prefs.channels.push && !prefs.channels.email && !prefs.channels.sms && !prefs.channels.inApp;

  return !pushOnly;

}



function alertTypeAllowed(
  prefs: NotificationPrefs,
  notificationType: string,
  metadata?: Record<string, unknown>,
): boolean {
  if (notificationType === "event_reminder") {
    return prefs.alertTypes.reminders;
  }

  if (notificationType.startsWith("partnership")) {
    return prefs.alertTypes.sleepingPartnerProposals;
  }

  if (notificationType.startsWith("proposal")) {
    const proposalType = metadata?.proposalType;
    if (proposalType === "sleeping") {
      return prefs.alertTypes.sleepingProposals;
    }
    return prefs.alertTypes.eventProposals;
  }

  return true;
}



/**

 * Resolves the in-app / push deep-link URL from notification type and metadata (PC-58).

 */

export function resolveNotificationUrl(

  notificationType: string,

  metadata?: Record<string, unknown>,

): string {

  if (typeof metadata?.url === "string" && metadata.url.startsWith("/")) {

    return metadata.url;

  }

  if (typeof metadata?.proposalId === "string") {

    return `/proposals?open=${encodeURIComponent(metadata.proposalId)}`;

  }

  if (typeof metadata?.partnershipId === "string") {

    return "/people";

  }

  if (typeof metadata?.placeId === "string") {

    return "/places";

  }

  if (notificationType.startsWith("partnership")) return "/people";

  if (notificationType.startsWith("residency")) return "/places";

  if (notificationType.startsWith("place")) return "/places";

  if (notificationType.startsWith("proposal")) return "/proposals";

  return "/proposals";

}



/**

 * Records a user-targeted system notification in the activity log (PC-40 inbox).

 * Fans out to Web Push and email when each channel is enabled (PC-43/PC-58).

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



  if (!prefs.globalEnabled || !alertTypeAllowed(prefs, notificationType, metadata)) return;



  const url = resolveNotificationUrl(notificationType, metadata);



  if (prefs.channels.inApp && !shouldSuppressInAppDelivery(prefs, notificationType)) {

    await logUserActivity(

      userId,

      `notification.${notificationType}`,

      JSON.stringify({ message, url, ...metadata }),

      "system",

    );

  }



  if (prefs.channels.push && !shouldSuppressPushDelivery(prefs, notificationType)) {

    await sendPushToUser(userId, {

      title: formatPushTitle(notificationType),

      body: message,

      url,

      notificationType,

      metadata,

    });

  }



  await maybeQueueEmailNotification(userId, notificationType, message, metadata, prefs);

}



function formatPushTitle(notificationType: string): string {

  return notificationType.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

  if (!alertTypeAllowed(prefs, notificationType, metadata)) return;



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

