import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { sendPushToUser } from "@/lib/push";
import { parseNotificationPrefs } from "@/types/notification-prefs";
import { eq } from "drizzle-orm";

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

  await maybeQueueEmailNotification(userId, notificationType, message, metadata);
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
  const prefs = parseNotificationPrefs(row.notificationPrefsJson);
  if (!prefs.globalEnabled || !prefs.channels.email) return;

  const alertKey = notificationType.split("_")[0];
  if (alertKey === "partnership" && !prefs.alertTypes.partnerships) return;
  if (alertKey === "proposal" && !prefs.alertTypes.proposals) return;
  if (alertKey === "event" && !prefs.alertTypes.events) return;

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
}
