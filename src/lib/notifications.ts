import { logUserActivity } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { buildNotificationEmailContent } from "@/lib/email/templates";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { getPublicAppUrl } from "@/lib/env";
import { sendPushToUser } from "@/lib/push";
import { buildProposalNotificationDetail } from "@/lib/notifications-detail";
import { parseNotificationPrefs, type NotificationPrefs } from "@/types/notification-prefs";
import { eq } from "drizzle-orm";

const URGENT_NOTIFICATION_TYPES = new Set(["password_reset", "account_paused", "account_deleted"]);

/**
 * Builds consistent actor metadata for user-facing notifications (PC-299).
 * The fallback keeps notification copy and audit attribution useful when a
 * legacy or partially populated user record has no display name.
 */
export function actorNotifyFields(actor: {
  id: string;
  displayName?: string | null;
}): { actorUserId: string; actorDisplayName: string } {
  return {
    actorUserId: actor.id,
    actorDisplayName: actor.displayName?.trim() || "Someone",
  };
}

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

/**
 * During quiet hours suppress email unless email is the user's only channel (PC-160).
 * Urgent types always deliver.
 */
export function shouldSuppressEmailDelivery(
  prefs: NotificationPrefs,
  notificationType: string,
  now = new Date(),
): boolean {
  if (URGENT_NOTIFICATION_TYPES.has(notificationType)) return false;
  if (!isInQuietHours(prefs, now)) return false;

  const emailOnly =
    prefs.channels.email && !prefs.channels.push && !prefs.channels.sms && !prefs.channels.inApp;
  return !emailOnly;
}

function alertTypeAllowed(
  prefs: NotificationPrefs,
  notificationType: string,
  metadata?: Record<string, unknown>,
): boolean {
  if (notificationType === "feed_chat_reply") {
    return prefs.alertTypes.feedChatReplies;
  }

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

  if (notificationType === "calendar_ics_pending") {
    return true;
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

  if (notificationType === "calendar_ics_pending") {
    if (typeof metadata?.proposalId === "string") {
      return `/proposals?open=${encodeURIComponent(metadata.proposalId)}`;
    }
    return "/proposals";
  }

  if (notificationType === "feed_chat_reply") {
    return "/feed";
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
 * Fans out to Web Push and email when each channel is enabled (PC-43/PC-58/PC-160).
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
  // Enrich outward-facing surfaces (push + email) with proposal context (when /
  // where) when the metadata carries it. The in-app inbox renders this detail
  // itself from metadata, so the stored message string is left unchanged.
  const detail = buildProposalNotificationDetail(metadata);

  if (prefs.channels.inApp && !shouldSuppressInAppDelivery(prefs, notificationType)) {
    await logUserActivity(
      userId,
      `notification.${notificationType}`,
      JSON.stringify({ message, url, ...metadata }),
      "system",
    );
  }

  if (prefs.channels.push && !shouldSuppressPushDelivery(prefs, notificationType)) {
    const proposalId =
      typeof metadata?.proposalId === "string" ? metadata.proposalId : undefined;
    const actions =
      proposalId && canAcceptFromNotification(notificationType, metadata)
        ? [
            { action: "accept", title: "Accept" },
            { action: "open", title: "Open Notification" },
          ]
        : undefined;

    await sendPushToUser(userId, {
      title: formatPushTitle(notificationType),
      body: detail ? `${message}\n${detail}` : message,
      url,
      notificationType,
      proposalId,
      actions,
      metadata,
    });
  }

  await maybeQueueEmailNotification(userId, notificationType, message, metadata, prefs, detail, url);
}

function formatPushTitle(notificationType: string): string {
  return notificationType.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * True when a recipient can accept (vote) directly from the notification. These
 * types are only delivered to invitees who still need to respond, so exposing an
 * Accept action button is safe (the vote action re-validates server-side).
 */
export function canAcceptFromNotification(
  notificationType: string,
  metadata?: Record<string, unknown>,
): boolean {
  if (notificationType === "proposal_submitted") return true;
  return metadata?.action === "vote";
}

/**
 * Sends email when the user has a verified notification email and email channel (PC-43/PC-160).
 */
async function maybeQueueEmailNotification(
  userId: string,
  notificationType: string,
  message: string,
  metadata: Record<string, unknown> | undefined,
  prefsOverride: NotificationPrefs | undefined,
  detail: string | undefined,
  pathUrl: string,
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
  if (shouldSuppressEmailDelivery(prefs, notificationType)) return;

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

  const absoluteUrl = `${getPublicAppUrl()}${pathUrl.startsWith("/") ? pathUrl : `/${pathUrl}`}`;
  const content = buildNotificationEmailContent({
    title: formatPushTitle(notificationType),
    message,
    detail,
    url: absoluteUrl,
  });

  try {
    const result = await sendEmail({
      to: row.notificationEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
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
