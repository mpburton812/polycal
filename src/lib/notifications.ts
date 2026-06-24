import { logUserActivity } from "@/lib/audit";

/**
 * Records a user-targeted system notification in the activity log (PC-40 inbox).
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
}
