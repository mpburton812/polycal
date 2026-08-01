import type { UserStatus } from "@/types/user";

import { getModerationDisplayForUser } from "@/lib/users/moderation-db";

/**
 * Reads the current account status from the database (source of truth for pause/ban/delete).
 */
export async function getLiveUserStatus(userId: string): Promise<UserStatus | null> {
  const moderation = await getModerationDisplayForUser(userId);
  return (moderation?.status as UserStatus | undefined) ?? null;
}
