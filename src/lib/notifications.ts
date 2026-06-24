import { logUserActivity } from "@/lib/audit";

/**
 * Records a user-targeted system notification in the activity log until a dedicated
 * in-app notification inbox ships (PC-37).
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
